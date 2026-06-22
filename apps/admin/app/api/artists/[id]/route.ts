import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { ArtistModel, artistStages, updateArtistSchema } from "@/models/Artist";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

function invalidIdResponse() {
  return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return invalidIdResponse();

    await connectMongo();
    const artist = await ArtistModel.findById(id).lean();
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

    const shopDomain = resolveShopDomain();
    const legacyId = artist._id.toString();
    const metaobjectId = artist.shopifySync?.metaobjectId?.trim();
    const canonicalArtist = shopDomain
      ? await CanonicalArtistModel.findOne({
          shopDomain,
          $or: [
            { legacyArtistId: legacyId },
            ...(metaobjectId
              ? [{ shopifyMetaobjectId: metaobjectId }, { "shopify.metaobjectGid": metaobjectId }]
              : []),
          ],
        }).lean()
      : null;

    const linkedUser = canonicalArtist?.linkedUserId
      ? await UserModel.findById(canonicalArtist.linkedUserId)
          .select({
            _id: 1,
            email: 1,
            role: 1,
            artistKey: 1,
            artistId: 1,
            isActive: 1,
            createdAt: 1,
            mustChangePassword: 1,
            accountSource: 1,
          })
          .lean()
      : null;

    return NextResponse.json(
      {
        artist: {
          ...artist,
          canonicalArtist: canonicalArtist
            ? {
                id: canonicalArtist._id.toString(),
                artistKey: canonicalArtist.artistKey,
                displayName: canonicalArtist.displayName,
                publicSlug: canonicalArtist.publicSlug,
                appUrl: canonicalArtist.appUrl,
                legacyArtistId: canonicalArtist.legacyArtistId,
                shopifyMetaobjectId: canonicalArtist.shopifyMetaobjectId || canonicalArtist.shopify?.metaobjectGid,
                linkedUserId: canonicalArtist.linkedUserId?.toString(),
                accountStatus: canonicalArtist.accountStatus,
                linkStatus: canonicalArtist.linkStatus,
                linkedUser: linkedUser
                  ? {
                      id: linkedUser._id.toString(),
                      email: linkedUser.email,
                      role: linkedUser.role,
                      artistKey: linkedUser.artistKey,
                      artistId: linkedUser.artistId?.toString(),
                      isActive: linkedUser.isActive !== false,
                      createdAt: linkedUser.createdAt,
                      mustChangePassword: linkedUser.mustChangePassword,
                      accountSource: linkedUser.accountSource,
                    }
                  : null,
              }
            : null,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to fetch artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return invalidIdResponse();

    const json = await req.json();
    const parsed = updateArtistSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.stage === "Under Contract") {
      const profile = parsed.data.publicProfile || {};
      const name = profile.name?.trim() || profile.displayName?.trim();
      const text1 = profile.text_1?.trim() || profile.bio?.trim();
      const errors: Record<string, string[]> = {};
      if (!name) errors["publicProfile.name"] = ["Name is required for Under Contract"];
      if (!text1) errors["publicProfile.text_1"] = ["text_1 is required for Under Contract"];
      if (Object.keys(errors).length > 0) {
        return NextResponse.json({ error: { fieldErrors: errors } }, { status: 400 });
      }
    }

    await connectMongo();
    const updated = await ArtistModel.findByIdAndUpdate(id, parsed.data, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

    return NextResponse.json({ artist: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) return invalidIdResponse();

    await connectMongo();
    const deleted = await ArtistModel.findByIdAndDelete(id).lean();
    if (!deleted) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    return NextResponse.json({ artist: deleted }, { status: 200 });
  } catch (err) {
    console.error("Failed to delete artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
