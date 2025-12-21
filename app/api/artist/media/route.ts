import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { Readable } from "stream";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { getS3ObjectUrl, uploadToS3 } from "@/lib/s3";
import { MediaModel, mediaKinds } from "@/models/Media";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Allow slow/large uploads to complete
export const maxDuration = 300;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artistId = session.user.artistId;
  if (!artistId || !Types.ObjectId.isValid(artistId)) {
    return NextResponse.json({ error: "Artist not linked" }, { status: 400 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const filter: Record<string, unknown> = { artistId };
  if (kind && mediaKinds.includes(kind as (typeof mediaKinds)[number])) {
    filter.kind = kind;
  }

  await connectMongo();
  const media = await MediaModel.find(filter).sort({ createdAt: -1 }).lean();

  const payload = await Promise.all(
    media.map(async (m) => {
      const signedUrl = await getS3ObjectUrl(m.s3Key).catch(() => m.url);
      return {
        id: m._id.toString(),
        artistId: m.artistId?.toString(),
        kind: m.kind,
        filename: m.filename,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        s3Key: m.s3Key,
        url: signedUrl || m.url,
        createdAt: m.createdAt,
      };
    }),
  );

  return NextResponse.json({ media: payload }, { status: 200 });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "artist") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artistId = session.user.artistId;
  if (!artistId || !Types.ObjectId.isValid(artistId)) {
    return NextResponse.json({ error: "Artist not linked" }, { status: 400 });
  }

  const formData = await req.formData();
  const kindRaw = formData.get("kind");
  const kind = typeof kindRaw === "string" ? kindRaw : "";
  if (!mediaKinds.includes(kind as (typeof mediaKinds)[number])) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const uploads = [];
  try {
    await connectMongo();

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 });
      }
      const safeName = file.name || "upload";
      const key = `artist/${artistId}/${Date.now()}-${safeName.replace(/\s+/g, "-")}`;
      const webStream = file.stream() as unknown as ReadableStream;
      const stream = Readable.fromWeb(webStream);
      const uploaded = await uploadToS3(key, stream, file.type || "application/octet-stream", safeName, file.size);

      const created = await MediaModel.create({
        artistId,
        kind,
        filename: uploaded.filename,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        s3Key: uploaded.key,
        url: uploaded.url,
      });

      uploads.push({
        id: created._id.toString(),
        artistId: created.artistId?.toString(),
        kind: created.kind,
        filename: created.filename,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        s3Key: created.s3Key,
        url: created.url,
        createdAt: created.createdAt,
      });
    }

    return NextResponse.json({ media: uploads }, { status: 201 });
  } catch (err) {
    console.error("Failed to upload artist media", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
