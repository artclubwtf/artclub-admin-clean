import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel, createArtistSchema } from "@/models/Artist";

export async function GET() {
  try {
    await connectMongo();
    const artists = await ArtistModel.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ data: artists }, { status: 200 });
  } catch (err) {
    console.error("Failed to list artists", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parse = createArtistSchema.safeParse(json);
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.flatten() }, { status: 400 });
    }

    await connectMongo();
    const artist = await ArtistModel.create(parse.data);
    return NextResponse.json({ data: artist.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
