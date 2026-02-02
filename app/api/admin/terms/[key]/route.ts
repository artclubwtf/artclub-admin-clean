import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ensureTermsDocument } from "@/lib/terms";
import { TermsVersionModel } from "@/models/TermsVersion";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Invalid terms key" }, { status: 400 });
  }

  await connectMongo();
  const document = await ensureTermsDocument(key);

  const versions = await TermsVersionModel.find({ documentId: document._id })
    .sort({ version: -1, createdAt: -1 })
    .lean();

  const payload = versions.map((version) => ({
    id: version._id.toString(),
    version: version.version,
    status: version.status,
    effectiveAt: version.effectiveAt,
    changelog: version.changelog || "",
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    createdByUserId: version.createdByUserId?.toString(),
    content: {
      summaryMarkdown: version.content?.summaryMarkdown || "",
      fullMarkdown: version.content?.fullMarkdown || "",
      blocks: Array.isArray(version.content?.blocks) ? version.content?.blocks : [],
    },
  }));

  return NextResponse.json(
    {
      document: {
        id: document._id.toString(),
        key: document.key,
        title: document.title,
        activeVersionId: document.activeVersionId?.toString(),
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      versions: payload,
    },
    { status: 200 },
  );
}
