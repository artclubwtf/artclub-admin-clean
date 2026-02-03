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

    await connectMongo();
    const docs = await UserSavedModel.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .select({ productGid: 1 })
      .lean();
    const productGids = docs.map((doc) => doc.productGid);

    return NextResponse.json({ productGids }, { status: 200 });
  } catch (err) {
    console.error("Failed to load saved artworks", err);
    const message = err instanceof Error ? err.message : "Failed to load saved";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
