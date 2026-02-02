import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { ensureTermsDocument } from "@/lib/terms";
import { TermsDocumentModel } from "@/models/TermsDocument";
import { TermsVersionModel } from "@/models/TermsVersion";

const defaultTermsKeys = ["artist_registration_terms"] as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();
  await Promise.all(defaultTermsKeys.map((key) => ensureTermsDocument(key)));

  const documents = await TermsDocumentModel.find({}).sort({ key: 1 }).lean();
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
      key: doc.key,
      title: doc.title,
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
