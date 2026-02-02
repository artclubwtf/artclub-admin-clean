import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { getApplicationTokenFromRequest, verifyApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { MediaModel } from "@/models/Media";

async function loadApplication(req: Request, id: string) {
  const token = getApplicationTokenFromRequest(req);
  const session = await getServerSession(authOptions);

  await connectMongo();
  const application = await ArtistApplicationModel.findById(id);
  if (!application) {
    return { error: NextResponse.json({ error: "Application not found" }, { status: 404 }) } as const;
  }

  if (token) {
    if (application.expiresAt && application.expiresAt.getTime() <= Date.now()) {
      return { error: NextResponse.json({ error: "token_expired" }, { status: 401 }) } as const;
    }
    if (verifyApplicationToken(token, application.applicationTokenHash)) {
      return { application } as const;
    }
  }

  const pendingRegistrationId = (session as any)?.user?.pendingRegistrationId as string | undefined;
  const isPendingArtist = session?.user?.role === "artist" && pendingRegistrationId && pendingRegistrationId === id;
  if (!isPendingArtist) {
    return { error: NextResponse.json({ error: "invalid_token" }, { status: 401 }) } as const;
  }

  return { application } as const;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const { id, mediaId } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }
  if (!Types.ObjectId.isValid(mediaId)) {
    return NextResponse.json({ error: "Invalid media id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;
  if (result.application.status === "rejected") {
    return NextResponse.json({ error: "Registration is locked" }, { status: 403 });
  }

  await connectMongo();
  const deleted = await MediaModel.findOneAndDelete({
    _id: new Types.ObjectId(mediaId),
    ownerType: "application",
    ownerId: new Types.ObjectId(id),
  }).lean();

  if (!deleted) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
