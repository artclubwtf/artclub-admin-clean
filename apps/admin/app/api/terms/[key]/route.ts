import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { loadActiveTermsVersion } from "@/lib/terms";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Invalid terms key" }, { status: 400 });
  }

  await connectMongo();
  const { document, version } = await loadActiveTermsVersion(key);

  if (!version || version.status !== "published") {
    return NextResponse.json({ error: "No published terms configured" }, { status: 500 });
  }

  return NextResponse.json(
    {
      document: {
        slug: document.slug || document.key,
        key: document.key,
        title: document.title,
      },
      version: {
        id: version._id.toString(),
        documentSlug: version.documentSlug || document.slug || document.key,
        version: version.version,
        effectiveAt: version.effectiveAt,
        bodyMarkdown: version.bodyMarkdown || version.content?.fullMarkdown || "",
        summaryMarkdown: version.content?.summaryMarkdown || "",
        fullMarkdown: version.content?.fullMarkdown || "",
        blocks: Array.isArray(version.content?.blocks) ? version.content?.blocks : [],
      },
    },
    { status: 200 },
  );
}
