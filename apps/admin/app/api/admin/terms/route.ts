import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ensureTermsDocument } from "@/lib/terms";
import { TermsDocumentModel } from "@/models/TermsDocument";
import { TermsVersionModel } from "@/models/TermsVersion";

const defaultTermsKeys = ["artist_registration_terms"] as const;
const createSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  await Promise.all(defaultTermsKeys.map((key) => ensureTermsDocument(key)));

  const documents = await TermsDocumentModel.find({}).sort({ slug: 1, key: 1 }).lean();
  const activeIds = documents
    .map((doc) => doc.activeVersionId?.toString())
    .filter((id): id is string => Boolean(id));

  const activeVersions = activeIds.length
    ? await TermsVersionModel.find({ _id: { $in: activeIds } }).lean()
    : [];
  const activeMap = new Map(activeVersions.map((version) => [version._id.toString(), version]));

  const payload = documents.map((doc) => {
    const active = doc.activeVersionId ? activeMap.get(doc.activeVersionId.toString()) : null;
    return {
      id: doc._id.toString(),
      slug: doc.slug || doc.key,
      key: doc.key,
      title: doc.title,
      isActive: doc.isActive !== false,
      activeVersion: active
        ? {
            id: active._id.toString(),
            version: active.version,
            status: active.status,
            effectiveAt: active.effectiveAt,
            createdAt: active.createdAt,
          }
        : null,
      updatedAt: doc.updatedAt,
    };
  });

  return NextResponse.json({ documents: payload }, { status: 200 });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Invalid payload" }, { status: 400 });
  }

  await connectMongo();
  const slug = parsed.data.slug.toLowerCase();
  const existing = await TermsDocumentModel.findOne({ $or: [{ slug }, { key: slug }] }).lean();
  if (existing) {
    return NextResponse.json({ error: "Document already exists" }, { status: 409 });
  }

  const document = await TermsDocumentModel.create({
    slug,
    key: slug,
    title: parsed.data.title,
    isActive: true,
  });

  return NextResponse.json(
    {
      document: {
        id: document._id.toString(),
        slug: document.slug,
        key: document.key,
        title: document.title,
        isActive: document.isActive !== false,
        activeVersionId: document.activeVersionId?.toString() || null,
      },
    },
    { status: 201 },
  );
}
