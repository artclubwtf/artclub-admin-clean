import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ensureTermsDocument } from "@/lib/terms";
import { TermsVersionModel } from "@/models/TermsVersion";

type DraftPayload = {
  summaryMarkdown?: string;
  fullMarkdown?: string;
  bodyMarkdown?: string;
  blocks?: unknown;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "team")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Invalid terms key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as DraftPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const hasSummary = typeof body.summaryMarkdown === "string";
  const hasBodyMarkdown = typeof body.bodyMarkdown === "string";
  const hasFull = typeof body.fullMarkdown === "string" || hasBodyMarkdown;
  const fullMarkdownValue = hasBodyMarkdown ? body.bodyMarkdown : body.fullMarkdown;
  const blocks = Array.isArray(body.blocks) ? body.blocks : undefined;
  const hasBlocks = blocks !== undefined;

  if (!hasSummary && !hasFull && !hasBlocks) {
    return NextResponse.json({ error: "No draft updates provided" }, { status: 400 });
  }

  await connectMongo();
  const document = await ensureTermsDocument(key);

  const existingDraft = await TermsVersionModel.findOne({ documentId: document._id, status: "draft" })
    .sort({ version: -1 })
    .exec();

  if (!existingDraft) {
    const latest = await TermsVersionModel.findOne({ documentId: document._id }).sort({ version: -1 }).lean();
    const nextVersion = latest?.version ? latest.version + 1 : 1;

      const created = await TermsVersionModel.create({
        documentId: document._id,
        documentSlug: document.slug || document.key,
        version: nextVersion,
        status: "draft",
        bodyMarkdown: hasFull ? fullMarkdownValue : "",
        content: {
          summaryMarkdown: hasSummary ? body.summaryMarkdown : "",
          fullMarkdown: hasFull ? fullMarkdownValue : "",
          blocks: blocks ?? [],
        },
        createdByAdminId: session.user.id,
        createdByUserId: session.user.id,
      });

    return NextResponse.json(
      {
        draft: {
          id: created._id.toString(),
          version: created.version,
          status: created.status,
          content: created.content,
          updatedAt: created.updatedAt,
        },
      },
      { status: 200 },
    );
  }

  if (hasSummary) existingDraft.set("content.summaryMarkdown", body.summaryMarkdown);
  if (hasFull) {
    existingDraft.set("content.fullMarkdown", fullMarkdownValue);
    existingDraft.set("bodyMarkdown", fullMarkdownValue);
  }
  if (blocks !== undefined) existingDraft.set("content.blocks", blocks);
  if (!existingDraft.documentSlug) existingDraft.set("documentSlug", document.slug || document.key);
  if (!existingDraft.createdByAdminId && session.user.id) existingDraft.set("createdByAdminId", session.user.id);

  await existingDraft.save();

  return NextResponse.json(
    {
      draft: {
        id: existingDraft._id.toString(),
        version: existingDraft.version,
        status: existingDraft.status,
        content: existingDraft.content,
        updatedAt: existingDraft.updatedAt,
      },
    },
    { status: 200 },
  );
}
