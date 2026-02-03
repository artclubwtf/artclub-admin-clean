import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { UserSavedModel } from "@/models/UserSaved";

export async function GET(req: Request) {
  try {
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 200) : 200;

    await connectMongo();
    const docs = await UserSavedModel.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select({ productGid: 1 })
      .lean();
    const productGids = docs.map((doc) => doc.productGid);

    return NextResponse.json({ productGids }, { status: 200 });
  } catch (err) {
    console.error("Failed to load saved ids", err);
    const message = err instanceof Error ? err.message : "Failed to load saved ids";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
