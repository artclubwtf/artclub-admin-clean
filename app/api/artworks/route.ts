import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { ArtworkModel, artworkSaleTypes } from "@/models/Artwork";
import { MediaModel } from "@/models/Media";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get("artistId");
    if (!artistId || !Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    await connectMongo();
    const artworks = await ArtworkModel.find({ artistId: new Types.ObjectId(artistId) })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ artworks }, { status: 200 });
  } catch (err) {
    console.error("Failed to list artworks", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { artistId, title, description, saleType, price, currency, editionSize, mediaIds } = json || {};
    if (!artistId || !Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!saleType || !artworkSaleTypes.includes(saleType)) {
      return NextResponse.json({ error: "Invalid saleType" }, { status: 400 });
    }
    if ((saleType === "print" || saleType === "both") && (typeof editionSize !== "number" || editionSize <= 0)) {
      return NextResponse.json({ error: "editionSize required for print/both" }, { status: 400 });
    }
    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: "mediaIds required" }, { status: 400 });
    }

    const objectIds = mediaIds
      .filter((id: any) => typeof id === "string" && Types.ObjectId.isValid(id))
      .map((id: string) => new Types.ObjectId(id));
    if (!objectIds.length) {
      return NextResponse.json({ error: "Invalid mediaIds" }, { status: 400 });
    }

    await connectMongo();
    const mediaDocs = await MediaModel.find({ _id: { $in: objectIds } }).lean();
    if (!mediaDocs.length) return NextResponse.json({ error: "Media not found" }, { status: 400 });

    const images = mediaDocs.map((m) => ({
      mediaId: m._id,
      url: m.url,
      s3Key: m.s3Key,
      filename: m.filename,
    }));

    const created = await ArtworkModel.create({
      artistId: new Types.ObjectId(artistId),
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      saleType,
      price: typeof price === "number" ? price : undefined,
      currency: currency || "EUR",
      editionSize: saleType === "print" || saleType === "both" ? editionSize : undefined,
      images,
    });

    return NextResponse.json({ artwork: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create artwork", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
