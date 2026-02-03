import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { UserSavedModel } from "@/models/UserSaved";
import { Types } from "mongoose";

function normalizeProductGid(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

type UserSavedIdDoc = {
  productGid?: string;
};

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
    const userObjectId = Types.ObjectId.isValid(user.id) ? new Types.ObjectId(user.id) : null;
    const userIdValues = userObjectId ? [userObjectId, user.id] : [user.id];
    if (userObjectId) {
      await UserSavedModel.collection.updateMany(
        { userId: user.id },
        { $set: { userId: userObjectId } },
      );
    }
    const docs = (await UserSavedModel.collection
      .find({ userId: { $in: userIdValues } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .project({ productGid: 1 })
      .toArray()) as UserSavedIdDoc[];
    const productGids = docs.map((doc) => normalizeProductGid(doc.productGid || "")).filter(Boolean);

    return NextResponse.json({ productGids }, { status: 200 });
  } catch (err) {
    console.error("Failed to load saved ids", err);
    const message = err instanceof Error ? err.message : "Failed to load saved ids";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
