import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { UserReactionModel } from "@/models/UserReaction";

const allowedEmojis = new Set(["🖤", "🔥", "👀", "😵‍💫"]);

export async function GET(req: Request) {
  try {
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids") || "";
    const ids = idsParam
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, reactions: {} }, { status: 200 });
    }

    await connectMongo();
    const docs = await UserReactionModel.find({ userId: user.id, productGid: { $in: ids } })
      .select({ productGid: 1, emoji: 1 })
      .lean();

    const reactions: Record<string, string> = {};
    docs.forEach((doc) => {
      if (doc.productGid && typeof doc.emoji === "string" && allowedEmojis.has(doc.emoji)) {
        reactions[doc.productGid] = doc.emoji;
      }
    });

    return NextResponse.json({ ok: true, reactions }, { status: 200 });
  } catch (err) {
    console.error("Failed to load user reactions", err);
    const message = err instanceof Error ? err.message : "Failed to load reactions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
