import { hash } from "bcryptjs";
import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { resolveShopDomain } from "@/lib/shopDomain";
import { ArtistModel } from "@/models/Artist";
import { UserModel } from "@/models/User";

function slugify(value: string) {
  return value
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { artistId?: string; email?: string } | null;
    const artistId = body?.artistId?.toString().trim() ?? "";
    const emailRaw = body?.email?.toString().trim().toLowerCase() ?? "";

    if (!artistId || !Types.ObjectId.isValid(artistId)) {
      return NextResponse.json({ error: "Invalid artistId" }, { status: 400 });
    }
    if (!emailRaw || !emailRaw.includes("@")) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    const shopDomain = resolveShopDomain();
    if (!shopDomain) {
      return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 500 });
    }

    await connectMongo();
    const artist = await ArtistModel.findById(artistId)
      .select({ _id: 1, name: 1, publicProfile: 1, shopifySync: 1 })
      .lean();
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    const existingArtistUser = await UserModel.findOne({ shopDomain, role: "artist", artistId })
      .select({ _id: 1, email: 1, mustChangePassword: 1 })
      .lean();
    if (existingArtistUser) {
      return NextResponse.json(
        { error: "An artist account is already provisioned for this artist" },
        { status: 409 },
      );
    }

    const existing = await UserModel.findOne({ email: emailRaw }).select({ _id: 1 }).lean();
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const normalizedArtistSlug =
      firstNonEmpty(
        artist.shopifySync?.handle,
        slugify(artist.publicProfile?.displayName || ""),
        slugify(artist.publicProfile?.name || ""),
        slugify(artist.name || ""),
      ) || `artist-${artistId.toLowerCase()}`;

    // Transitional bootstrap only: preprovisioned accounts start with the normalized artist slug
    // and are forced to rotate the password immediately after first login.
    const passwordHash = await hash(normalizedArtistSlug, 12);
    const user = await UserModel.create({
      email: emailRaw,
      role: "artist",
      artistId,
      shopDomain,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    });

    return NextResponse.json(
      {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          artistId: user.artistId?.toString(),
          isActive: user.isActive,
          createdAt: user.createdAt,
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
  } catch (err) {
    console.error("Failed to create artist user", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
