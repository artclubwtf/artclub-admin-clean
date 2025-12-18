import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel, createArtistSchema, artistStages } from "@/models/Artist";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const stage = searchParams.get("stage")?.trim();

    await connectMongo();
    const filter: any = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
      ];
    }
    if (stage && artistStages.includes(stage as any)) {
      filter.stage = stage;
    }

    const artists = await ArtistModel.find(filter).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ artists }, { status: 200 });
  } catch (err) {
    console.error("Failed to list artists", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = createArtistSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await connectMongo();
    const created = await ArtistModel.create(parsed.data);
    return NextResponse.json({ artist: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
