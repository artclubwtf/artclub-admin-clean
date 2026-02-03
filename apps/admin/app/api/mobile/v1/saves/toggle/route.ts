import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { incrementSavesCount } from "@/models/ArtworkSignals";
import { UserSavedModel } from "@/models/UserSaved";

type TogglePayload = {
  productGid?: string;
};

export async function POST(req: Request) {
  try {
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as TogglePayload | null;
    const productGid = typeof body?.productGid === "string" ? body.productGid.trim() : "";
    if (!productGid) {
      return NextResponse.json({ error: "productGid is required" }, { status: 400 });
    }

    await connectMongo();

    const existing = await UserSavedModel.findOne({ userId: user.id, productGid }).lean();
    if (existing) {
      await UserSavedModel.deleteOne({ _id: existing._id });
      await incrementSavesCount(productGid, -1);
      return NextResponse.json({ ok: true, saved: false }, { status: 200 });
    }

    await UserSavedModel.create({ userId: user.id, productGid, createdAt: new Date() });
    await incrementSavesCount(productGid, 1);
    return NextResponse.json({ ok: true, saved: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to toggle save", err);
    const message = err instanceof Error ? err.message : "Failed to toggle save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
