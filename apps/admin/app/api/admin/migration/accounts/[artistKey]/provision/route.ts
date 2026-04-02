import { hash } from "bcryptjs";
import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/requireAdmin";
import { resolveShopDomain } from "@/lib/shopDomain";
import { CanonicalArtistModel } from "@/models/CanonicalArtist";
import { UserModel } from "@/models/User";

function slugify(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export async function POST(req: Request, { params }: { params: Promise<{ artistKey: string }> }) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { artistKey: rawArtistKey } = await params;
  const artistKey = rawArtistKey?.trim();
  if (!artistKey) {
    return NextResponse.json({ ok: false, error: "invalid_artist_key" }, { status: 400 });
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

  if (artist.linkedUserId) {
    return NextResponse.json({ ok: false, error: "artist_already_linked" }, { status: 409 });
  }

  const existingArtistUser = await UserModel.findOne({ shopDomain, role: "artist", artistKey })
    .select({ _id: 1 })
    .lean();
  if (existingArtistUser) {
    return NextResponse.json({ ok: false, error: "artist_key_already_used_by_other_account" }, { status: 409 });
  }

  const email = firstNonEmpty(artist.email);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "artist_has_no_valid_email" }, { status: 400 });
  }

  const existingEmailUser = await UserModel.findOne({ email: email.toLowerCase() }).select({ _id: 1 }).lean();
  if (existingEmailUser) {
    return NextResponse.json({ ok: false, error: "email_already_used_by_existing_account" }, { status: 409 });
  }

  const normalizedArtistSlug =
    firstNonEmpty(
      slugify(artist.publicSlug),
      slugify(artist.handle),
      slugify(artist.displayName),
      slugify(artist.artistKey),
    ) || `artist-${artistKey.toLowerCase()}`;

  const legacyArtistObjectId =
    artist.legacyArtistId && Types.ObjectId.isValid(artist.legacyArtistId) ? new Types.ObjectId(artist.legacyArtistId) : undefined;

  const passwordHash = await hash(normalizedArtistSlug, 12);
  const user = await UserModel.create({
    email: email.toLowerCase(),
    role: "artist",
    name: firstNonEmpty(artist.displayName, artist.handle, artist.artistKey),
    shopDomain,
    artistKey,
    ...(legacyArtistObjectId ? { artistId: legacyArtistObjectId } : {}),
    passwordHash,
    mustChangePassword: true,
    isActive: true,
  });

  await CanonicalArtistModel.updateOne(
    { shopDomain, artistKey },
    {
      $set: {
        linkedUserId: user._id,
        linkStatus: "linked",
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        artistKey: user.artistKey,
        mustChangePassword: user.mustChangePassword,
      },
      bootstrap: {
        initialPassword: normalizedArtistSlug,
        mode: "insecure_slug_bootstrap",
        warning: "Transitional preprovisioned account. Password must be changed on first login.",
      },
    },
    { status: 201 },
  );
}
