import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ensureTermsDocument } from "@/lib/terms";
import { TermsVersionModel } from "@/models/TermsVersion";

type PublishPayload = {
  changelog?: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Invalid terms key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as PublishPayload | null;
  const changelog = typeof body?.changelog === "string" ? body.changelog.trim() : "";
  if (!changelog) {
    return NextResponse.json({ error: "Changelog is required" }, { status: 400 });
  }

  await connectMongo();
  const document = await ensureTermsDocument(key);

  const draft = await TermsVersionModel.findOne({ documentId: document._id, status: "draft" })
    .sort({ version: -1 })
    .exec();
  if (!draft) {
    return NextResponse.json({ error: "No draft available to publish" }, { status: 400 });
  }

  const now = new Date();

  await TermsVersionModel.updateMany(
    { documentId: document._id, status: "published", _id: { $ne: draft._id } },
    { $set: { status: "archived" } },
  );

  draft.status = "published";
  draft.effectiveAt = now;
  draft.changelog = changelog;
  if (!draft.createdByUserId) {
    const userId = session.user.id;
    if (userId && Types.ObjectId.isValid(userId)) {
      draft.createdByUserId = new Types.ObjectId(userId);
    }
  }
  await draft.save();

  document.activeVersionId = draft._id;
  await document.save();

  return NextResponse.json(
    {
      version: {
        id: draft._id.toString(),
        version: draft.version,
        status: draft.status,
        effectiveAt: draft.effectiveAt,
        changelog: draft.changelog,
        updatedAt: draft.updatedAt,
      },
      activeVersionId: document.activeVersionId?.toString(),
    },
    { status: 200 },
  );
}
