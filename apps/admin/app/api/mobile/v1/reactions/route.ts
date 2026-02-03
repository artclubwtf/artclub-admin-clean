import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ArtworkSignalsModel } from "@/models/ArtworkSignals";

const allowedEmojis = new Set(["🖤", "🔥", "👀", "😵‍💫"]);

type ReactionPayload = {
  productGid?: string;
  emoji?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ReactionPayload | null;
    const productGid = typeof body?.productGid === "string" ? body.productGid.trim() : "";
    const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";

    if (!productGid) {
      return NextResponse.json({ error: "productGid is required" }, { status: 400 });
    }
    if (!allowedEmojis.has(emoji)) {
      return NextResponse.json({ error: "emoji is invalid" }, { status: 400 });
    }

    await connectMongo();

    await ArtworkSignalsModel.updateOne(
      { productGid },
      {
        $setOnInsert: { productGid },
        $inc: { [`reactions.${emoji}`]: 1 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to record reaction", err);
    const message = err instanceof Error ? err.message : "Failed to record reaction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
