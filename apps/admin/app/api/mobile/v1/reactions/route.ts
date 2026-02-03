import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { ArtworkSignalsModel } from "@/models/ArtworkSignals";
import { UserReactionModel } from "@/models/UserReaction";

const allowedEmojis = new Set(["🖤", "🔥", "👀", "😵‍💫"]);

type ReactionPayload = {
  productGid?: string;
  emoji?: string;
};

export async function POST(req: Request) {
  try {
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    await UserReactionModel.updateOne(
      { userId: user.id, productGid },
      { $set: { emoji } },
      { upsert: true, setDefaultsOnInsert: true },
    );

    await ArtworkSignalsModel.updateOne(
      { productGid },
      {
        $setOnInsert: { productGid },
        $inc: { [`reactions.${emoji}`]: 1 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ ok: true, emoji }, { status: 200 });
  } catch (err) {
    console.error("Failed to record reaction", err);
    const message = err instanceof Error ? err.message : "Failed to record reaction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
