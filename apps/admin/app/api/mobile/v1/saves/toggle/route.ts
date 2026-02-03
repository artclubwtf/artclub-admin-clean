import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { getMobileUserFromRequest } from "@/lib/mobileAuth";
import { incrementSavesCount } from "@/models/ArtworkSignals";
import { UserSavedModel } from "@/models/UserSaved";
import { Types } from "mongoose";

type TogglePayload = {
  productGid?: string;
  saved?: boolean;
};

function normalizeProductGid(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export async function POST(req: Request) {
  try {
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as TogglePayload | null;
    const productGid = typeof body?.productGid === "string" ? normalizeProductGid(body.productGid) : "";
    if (!productGid) {
      return NextResponse.json({ error: "productGid is required" }, { status: 400 });
    }

    await connectMongo();

    const desiredSaved = typeof body?.saved === "boolean" ? body.saved : undefined;
    const userObjectId = Types.ObjectId.isValid(user.id) ? new Types.ObjectId(user.id) : null;
    const userIdValues = userObjectId ? [userObjectId, user.id] : [user.id];
    if (userObjectId) {
      await UserSavedModel.collection.updateMany(
        { userId: user.id },
        { $set: { userId: userObjectId } },
      );
    }

    const existing = (await UserSavedModel.collection.findOne({
      userId: { $in: userIdValues },
      productGid,
    })) as { _id: Types.ObjectId } | null;

    if (desiredSaved === true) {
      if (existing) {
        return NextResponse.json({ ok: true, saved: true }, { status: 200 });
      }
      await UserSavedModel.collection.insertOne({
        userId: userObjectId || user.id,
        productGid,
        createdAt: new Date(),
      });
      await incrementSavesCount(productGid, 1);
      return NextResponse.json({ ok: true, saved: true }, { status: 200 });
    }

    if (desiredSaved === false) {
      if (!existing) {
        return NextResponse.json({ ok: true, saved: false }, { status: 200 });
      }
      await UserSavedModel.collection.deleteOne({ _id: existing._id });
      await incrementSavesCount(productGid, -1);
      return NextResponse.json({ ok: true, saved: false }, { status: 200 });
    }

    if (existing) {
      await UserSavedModel.collection.deleteOne({ _id: existing._id });
      await incrementSavesCount(productGid, -1);
      return NextResponse.json({ ok: true, saved: false }, { status: 200 });
    }

    await UserSavedModel.collection.insertOne({
      userId: userObjectId || user.id,
      productGid,
      createdAt: new Date(),
    });
    await incrementSavesCount(productGid, 1);
    return NextResponse.json({ ok: true, saved: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to toggle save", err);
    const message = err instanceof Error ? err.message : "Failed to toggle save";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
