import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { getApplicationTokenFromRequest, verifyApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

const REAPPLY_MONTHS = 6;

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeApplication(app: any) {
  return {
    id: app._id.toString(),
    status: app.status,
    expiresAt: app.expiresAt,
    personal: app.personal || {},
    shopify: app.shopify || {},
    profileImages: app.profileImages || {},
    intents: app.intents || {},
    legal: app.legal || {},
    submittedAt: app.submittedAt,
    reviewedAt: app.reviewedAt,
    acceptedAt: app.acceptedAt,
    rejectedAt: app.rejectedAt,
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

function applyEmail(updates: Record<string, unknown>, source: Record<string, unknown> | null, key: string, path: string) {
  if (!source) return;
  const value = source[key];
  if (typeof value === "string") {
    updates[path] = value.trim().toLowerCase();
  }
}

function applyBoolean(updates: Record<string, unknown>, source: Record<string, unknown> | null, key: string, path: string) {
  if (!source) return;
  const value = source[key];
  if (typeof value === "boolean") {
    updates[path] = value;
  }
}

async function loadApplication(req: Request, id: string) {
  const token = getApplicationTokenFromRequest(req);
  const session = await getServerSession(authOptions);

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id);
  if (!application) {
    return { error: NextResponse.json({ error: "Application not found" }, { status: 404 }) } as const;
  }

  const pendingRegistrationId = (session as any)?.user?.pendingRegistrationId as string | undefined;
  const isPendingArtist = session?.user?.role === "artist" && pendingRegistrationId && pendingRegistrationId === id;

  if (token) {
    if (application.expiresAt && application.expiresAt.getTime() <= Date.now()) {
      return { error: NextResponse.json({ error: "token_expired" }, { status: 401 }) } as const;
    }
    if (verifyApplicationToken(token, application.applicationTokenHash)) {
      return { application, session, isPendingArtist } as const;
    }
  }

  if (!isPendingArtist) {
    return { error: NextResponse.json({ error: "invalid_token" }, { status: 401 }) } as const;
  }

  return { application, session, isPendingArtist } as const;
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
  const intents = (body.intents && typeof body.intents === "object" ? body.intents : null) as Record<string, unknown> | null;
  const legal = (body.legal && typeof body.legal === "object" ? body.legal : null) as Record<string, unknown> | null;

  applyString(updates, personal, "fullName", "personal.fullName");
  if (!result.isPendingArtist) {
    applyEmail(updates, personal, "email", "personal.email");
  }
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

  applyBoolean(updates, intents, "exhibitAtEvents", "intents.exhibitAtEvents");
  applyBoolean(updates, intents, "rentOriginals", "intents.rentOriginals");
  applyBoolean(updates, intents, "licensePrintRights", "intents.licensePrintRights");
  applyBoolean(updates, intents, "presentOnly", "intents.presentOnly");
  applyBoolean(updates, intents, "sellOriginals", "intents.sellOriginals");
  applyBoolean(updates, intents, "sellPrints", "intents.sellPrints");
  applyString(updates, intents, "notes", "intents.notes");

  applyString(updates, legal, "termsVersion", "legal.termsVersion");
  applyString(updates, legal, "acceptedName", "legal.acceptedName");

  const sessionEmail = typeof result.session?.user?.email === "string" ? result.session.user.email.trim().toLowerCase() : "";
  if (result.isPendingArtist && sessionEmail) {
    const existingEmail =
      typeof result.application.personal?.email === "string" ? result.application.personal.email.trim().toLowerCase() : "";
    if (sessionEmail !== existingEmail) {
      updates["personal.email"] = sessionEmail;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const incomingEmail =
    result.isPendingArtist && sessionEmail ? sessionEmail : typeof personal?.email === "string" ? personal.email.trim().toLowerCase() : "";
  if (incomingEmail) {
    const existing = await ArtistApplicationModel.findOne({
      _id: { $ne: result.application._id },
      "personal.email": { $regex: `^${escapeRegex(incomingEmail)}$`, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existing?.status === "submitted" || existing?.status === "in_review") {
      return NextResponse.json({ error: "We’re reviewing your registration." }, { status: 403 });
    }

    if (existing?.status === "rejected") {
      const rejectedBase = existing.rejectedAt || existing.updatedAt || existing.createdAt || new Date();
      const reapplyAfter = addMonths(new Date(rejectedBase), REAPPLY_MONTHS);
      if (reapplyAfter.getTime() > Date.now()) {
        return NextResponse.json(
          { error: `Re-register available after ${reapplyAfter.toDateString()}.`, reapplyAfter },
          { status: 403 },
        );
      }
    }
  }

  result.application.set(updates);
  await result.application.save();

  return NextResponse.json({ application: serializeApplication(result.application) }, { status: 200 });
}
