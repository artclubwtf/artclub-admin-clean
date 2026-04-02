import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

const payloadSchema = z
  .object({
    linkedUserId: z.string().trim().optional().or(z.literal("")),
    linkStatus: z.enum(["unlinked", "suggested", "linked", "needs_review"]).optional(),
  })
  .strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ artistKey: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { artistKey: rawArtistKey } = await params;
  const artistKey = rawArtistKey?.trim();
  if (!artistKey) {
    return NextResponse.json({ ok: false, error: "invalid_artist_key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = payloadSchema.safeParse(body || {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: issue?.message || "invalid_payload" }, { status: 400 });
  }

  const shopDomain = resolveShopDomain();
  if (!shopDomain) {
    return NextResponse.json({ ok: false, error: "missing_shop_domain" }, { status: 500 });
  }

  await connectMongo();

  const artist = await CanonicalArtistModel.findOne({ shopDomain, artistKey }).lean();
  if (!artist) {
    return NextResponse.json({ ok: false, error: "artist_not_found" }, { status: 404 });
  }

  let linkedUserId: Types.ObjectId | undefined;
  let linkedUser:
    | {
        _id: Types.ObjectId;
        artistKey?: string | null;
        artistId?: Types.ObjectId | null;
      }
    | null = null;
  const rawLinkedUserId = parsed.data.linkedUserId?.trim();
  if (rawLinkedUserId) {
    if (!Types.ObjectId.isValid(rawLinkedUserId)) {
      return NextResponse.json({ ok: false, error: "invalid_linked_user_id" }, { status: 400 });
    }
    const user = await UserModel.findOne({
      _id: rawLinkedUserId,
      shopDomain,
      role: "artist",
    })
      .select({ _id: 1, artistKey: 1, artistId: 1 })
      .lean();
    if (!user) {
      return NextResponse.json({ ok: false, error: "linked_user_not_found" }, { status: 404 });
    }
    const conflictingUser = await UserModel.findOne({
      shopDomain,
      role: "artist",
      artistKey,
      _id: { $ne: user._id },
    })
      .select({ _id: 1 })
      .lean();
    if (conflictingUser) {
      return NextResponse.json({ ok: false, error: "artist_key_already_used_by_other_account" }, { status: 409 });
    }
    linkedUser = user;
    linkedUserId = new Types.ObjectId(rawLinkedUserId);
  }

  const linkStatus = parsed.data.linkStatus || (linkedUserId ? "linked" : "needs_review");

  if (linkedUserId && linkedUser) {
    const legacyArtistObjectId =
      artist.legacyArtistId && Types.ObjectId.isValid(artist.legacyArtistId) ? new Types.ObjectId(artist.legacyArtistId) : undefined;

    await UserModel.updateOne(
      { _id: linkedUser._id, shopDomain, role: "artist" },
      {
        $set: {
          artistKey,
          ...(legacyArtistObjectId ? { artistId: legacyArtistObjectId } : {}),
        },
      },
    );

    await CanonicalArtistModel.updateMany(
      {
        shopDomain,
        linkedUserId,
        artistKey: { $ne: artistKey },
      },
      {
        $set: {
          linkedUserId: null,
          linkStatus: "needs_review",
        },
      },
    );
  }

  await CanonicalArtistModel.updateOne(
    { shopDomain, artistKey },
    {
      $set: {
        ...(linkedUserId ? { linkedUserId } : { linkedUserId: null }),
        linkStatus,
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      artistKey,
      linkedUserId: linkedUserId?.toString() || "",
      linkStatus,
    },
    { status: 200 },
  );
}
