import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { getMultipartPartUrl } from "@/lib/s3";

const schema = z.object({
  artistId: z.string().trim().min(1, "artistId required"),
  key: z.string().trim().min(1, "key required"),
  uploadId: z.string().trim().min(1, "uploadId required"),
  partNumber: z.number().int().positive().max(10000),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { artistId, key, uploadId, partNumber } = parsed.data;
    if (!Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    if (!key.startsWith(`artist/${encodeURIComponent(artistId)}/`)) {
      return NextResponse.json({ error: "Key does not match artistId" }, { status: 400 });
    }

    await connectMongo();
    const { url, expiresIn } = await getMultipartPartUrl(key, uploadId, partNumber);

    return NextResponse.json({ url, expiresIn }, { status: 200 });
  } catch (err) {
    console.error("Sign multipart part failed", err);
    return NextResponse.json({ error: "Failed to sign part" }, { status: 500 });
  }
}
