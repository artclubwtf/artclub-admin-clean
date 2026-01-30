import { NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { getApplicationTokenFromRequest, verifyApplicationToken } from "@/lib/applicationAuth";
import { getPublicS3Url, getS3ObjectUrl, uploadToS3 } from "@/lib/s3";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { MediaModel, mediaKinds } from "@/models/Media";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function sanitizeFilename(name: string) {
  const trimmed = name.trim() || "upload";
  const base = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "upload";
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
  if (result.application.status === "rejected") {
    return NextResponse.json({ error: "Registration is locked" }, { status: 403 });
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const filter: Record<string, unknown> = {
    ownerType: "application",
    ownerId: new Types.ObjectId(id),
  };

  if (kindParam && mediaKinds.includes(kindParam as (typeof mediaKinds)[number])) {
    filter.kind = kindParam;
  }

  const media = await MediaModel.find(filter).sort({ createdAt: -1 }).lean();

  const payload = await Promise.all(
    media.map(async (m) => {
      const signedUrl = await getS3ObjectUrl(m.s3Key).catch(() => m.url);
      const previewUrl = m.previewUrl || signedUrl || m.url;
      return {
        id: m._id.toString(),
        ownerType: m.ownerType,
        ownerId: m.ownerId?.toString(),
        kind: m.kind,
        filename: m.filename,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        s3Key: m.s3Key,
        url: signedUrl || m.url,
        previewUrl,
        createdAt: m.createdAt,
      };
    }),
  );

  return NextResponse.json({ media: payload }, { status: 200 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
  }

  const result = await loadApplication(req, id);
  if ("error" in result) return result.error;

  const formData = await req.formData();
  const kindRaw = formData.get("kind");
  const kind = typeof kindRaw === "string" ? kindRaw : "artwork";
  if (!mediaKinds.includes(kind as (typeof mediaKinds)[number])) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  try {
    await connectMongo();

    const uploads = [] as Array<{
      id: string;
      ownerType: string;
      ownerId: string | undefined;
      kind: string;
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
      s3Key: string;
      url?: string;
      previewUrl?: string;
      createdAt?: Date;
    }>;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 });
      }

      const safeName = sanitizeFilename(file.name || "upload");
      const key = `application/${encodeURIComponent(id)}/${Date.now()}-${safeName}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const uploaded = await uploadToS3(key, buffer, file.type || "application/octet-stream", safeName);

      const previewUrl = getPublicS3Url(uploaded.key);
      const created = await MediaModel.create({
        ownerType: "application",
        ownerId: new Types.ObjectId(id),
        kind,
        filename: uploaded.filename,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        s3Key: uploaded.key,
        url: uploaded.url,
        previewUrl,
      });

      uploads.push({
        id: created._id.toString(),
        ownerType: created.ownerType,
        ownerId: created.ownerId?.toString(),
        kind: created.kind,
        filename: created.filename ?? undefined,
        mimeType: created.mimeType ?? undefined,
        sizeBytes: created.sizeBytes ?? undefined,
        s3Key: created.s3Key,
        url: created.url ?? undefined,
        previewUrl: created.previewUrl ?? undefined,
        createdAt: created.createdAt,
      });
    }

    return NextResponse.json({ media: uploads }, { status: 201 });
  } catch (err) {
    console.error("Failed to upload application media", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
