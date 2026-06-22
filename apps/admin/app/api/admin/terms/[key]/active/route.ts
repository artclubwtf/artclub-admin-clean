import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ensureTermsDocument } from "@/lib/terms";
import { TermsVersionModel } from "@/models/TermsVersion";

const payloadSchema = z
  .object({
    versionId: z.string().trim().min(1),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "team")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Invalid terms key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Invalid payload" }, { status: 400 });
  }

  if (!Types.ObjectId.isValid(parsed.data.versionId)) {
    return NextResponse.json({ error: "Invalid versionId" }, { status: 400 });
  }

  await connectMongo();
  const document = await ensureTermsDocument(key);

  const version = await TermsVersionModel.findOne({
    _id: new Types.ObjectId(parsed.data.versionId),
    documentId: document._id,
  }).exec();
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  version.status = "published";
  if (!version.effectiveAt) version.effectiveAt = new Date();
  if (!version.documentSlug) version.documentSlug = document.slug || document.key;
  if (!version.bodyMarkdown) version.bodyMarkdown = version.content?.fullMarkdown || "";
  await version.save();

  await TermsVersionModel.updateMany(
    {
      documentId: document._id,
      _id: { $ne: version._id },
      status: "published",
    },
    { $set: { status: "archived" } },
  );

  document.activeVersionId = version._id;
  if (typeof parsed.data.isActive === "boolean") {
    document.isActive = parsed.data.isActive;
  } else {
    document.isActive = true;
  }
  await document.save();

  return NextResponse.json(
    {
      ok: true,
      activeVersionId: document.activeVersionId?.toString(),
      document: {
        id: document._id.toString(),
        slug: document.slug || document.key,
        key: document.key,
        isActive: document.isActive !== false,
      },
    },
    { status: 200 },
  );
}
