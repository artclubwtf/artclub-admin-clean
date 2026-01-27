import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { getApplicationTokenFromRequest, verifyApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

const TERMS_VERSION = "v1";

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",").map((part) => part.trim());
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || undefined;
}

async function loadApplication(req: Request, id: string) {
  const token = getApplicationTokenFromRequest(req);
  if (!token) {
    return { error: NextResponse.json({ error: "missing_token" }, { status: 401 }) } as const;
  }

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id);
  if (!application) {
    return { error: NextResponse.json({ error: "Application not found" }, { status: 404 }) } as const;
  }

  if (application.expiresAt && application.expiresAt.getTime() <= Date.now()) {
    return { error: NextResponse.json({ error: "token_expired" }, { status: 401 }) } as const;
  }

  if (!verifyApplicationToken(token, application.applicationTokenHash)) {
    return { error: NextResponse.json({ error: "invalid_token" }, { status: 401 }) } as const;
  }

  return { application } as const;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const accepted = body?.accepted === true;
  const legalPayload = (body?.legal && typeof body.legal === "object" ? body.legal : null) as Record<string, unknown> | null;

  const acceptedNameFromPayload = typeof legalPayload?.acceptedName === "string" ? legalPayload.acceptedName.trim() : "";
  const termsVersionFromPayload = typeof legalPayload?.termsVersion === "string" ? legalPayload.termsVersion.trim() : "";

  const application = result.application;
  const errors: Record<string, string> = {};

  if (!hasText(application.personal?.fullName)) {
    errors["personal.fullName"] = "Full name is required";
  }
  if (!hasText(application.personal?.email)) {
    errors["personal.email"] = "Email is required";
  }

  if (!hasText(application.shopify?.instagramUrl)) {
    errors["shopify.instagramUrl"] = "Instagram is required";
  }
  if (!hasText(application.shopify?.quote)) {
    errors["shopify.quote"] = "Quote is required";
  }
  if (!hasText(application.shopify?.einleitung_1)) {
    errors["shopify.einleitung_1"] = "Intro text is required";
  }
  if (!hasText(application.shopify?.text_1)) {
    errors["shopify.text_1"] = "Main text is required";
  }
  if (!hasText(application.shopify?.kategorieCollectionGid)) {
    errors["shopify.kategorieCollectionGid"] = "Category is required";
  }

  const profileImages = application.profileImages || {};
  const hasProfileImage = [profileImages.titelbildGid, profileImages.bild1Gid, profileImages.bild2Gid, profileImages.bild3Gid].some(
    (value) => hasText(value),
  );
  if (!hasProfileImage) {
    errors["profileImages"] = "At least one profile image is required";
  }

  const acceptedName = acceptedNameFromPayload || (application.legal?.acceptedName ? String(application.legal.acceptedName).trim() : "");
  if (!accepted) {
    errors["legal.accepted"] = "Terms must be accepted";
  }
  if (!acceptedName) {
    errors["legal.acceptedName"] = "Name is required";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: errors }, { status: 400 });
  }

  const now = new Date();
  const termsVersion = termsVersionFromPayload || application.legal?.termsVersion || TERMS_VERSION;

  application.status = "submitted";
  application.submittedAt = now;
  application.legal = {
    ...application.legal,
    termsVersion,
    acceptedAt: now,
    acceptedIp: getRequestIp(req),
    acceptedUserAgent: req.headers.get("user-agent") || undefined,
    acceptedName,
  };

  await application.save();

  return NextResponse.json(
    {
      application: {
        id: application._id.toString(),
        status: application.status,
        submittedAt: application.submittedAt,
      },
    },
    { status: 200 },
  );
}
