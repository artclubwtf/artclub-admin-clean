import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { getApplicationTokenFromRequest, verifyApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

function serializeApplication(app: any) {
  return {
    id: app._id.toString(),
    status: app.status,
    expiresAt: app.expiresAt,
    personal: app.personal || {},
    shopify: app.shopify || {},
    profileImages: app.profileImages || {},
    legal: app.legal || {},
    submittedAt: app.submittedAt,
    reviewedAt: app.reviewedAt,
    acceptedAt: app.acceptedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function applyString(
  updates: Record<string, unknown>,
  source: Record<string, unknown> | null,
  key: string,
  path: string,
) {
  if (!source) return;
  const value = source[key];
  if (typeof value === "string") {
    updates[path] = value;
  }
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;

  return NextResponse.json({ application: serializeApplication(result.application) }, { status: 200 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const personal = (body.personal && typeof body.personal === "object" ? body.personal : null) as Record<string, unknown> | null;
  const shopify = (body.shopify && typeof body.shopify === "object" ? body.shopify : null) as Record<string, unknown> | null;
  const profileImages = (body.profileImages && typeof body.profileImages === "object" ? body.profileImages : null) as
    | Record<string, unknown>
    | null;
  const legal = (body.legal && typeof body.legal === "object" ? body.legal : null) as Record<string, unknown> | null;

  applyString(updates, personal, "fullName", "personal.fullName");
  applyString(updates, personal, "email", "personal.email");
  applyString(updates, personal, "phone", "personal.phone");
  applyString(updates, personal, "city", "personal.city");
  applyString(updates, personal, "country", "personal.country");

  applyString(updates, shopify, "instagramUrl", "shopify.instagramUrl");
  applyString(updates, shopify, "quote", "shopify.quote");
  applyString(updates, shopify, "einleitung_1", "shopify.einleitung_1");
  applyString(updates, shopify, "text_1", "shopify.text_1");
  applyString(updates, shopify, "kategorieCollectionGid", "shopify.kategorieCollectionGid");

  applyString(updates, profileImages, "titelbildGid", "profileImages.titelbildGid");
  applyString(updates, profileImages, "bild1Gid", "profileImages.bild1Gid");
  applyString(updates, profileImages, "bild2Gid", "profileImages.bild2Gid");
  applyString(updates, profileImages, "bild3Gid", "profileImages.bild3Gid");

  applyString(updates, legal, "termsVersion", "legal.termsVersion");
  applyString(updates, legal, "acceptedName", "legal.acceptedName");

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  result.application.set(updates);
  await result.application.save();

  return NextResponse.json({ application: serializeApplication(result.application) }, { status: 200 });
}
