import { NextResponse } from "next/server";
import { fetchKuenstlerById, fetchProductsByCollectionId, updateKuenstler } from "@/lib/shopify";

const allowedFields = ["name", "instagram", "quote", "einleitung_1", "text_1"] as const;
type AllowedField = (typeof allowedFields)[number];

function decodeId(params: { id: string }) {
  return decodeURIComponent(params.id);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
    const decodedId = decodeId({ id });
    const artist = await fetchKuenstlerById(decodedId);
    if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    const products = artist.kategorie
      ? await fetchProductsByCollectionId(artist.kategorie)
      : [];
    return NextResponse.json({ artist, products }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Invalid artist id" }, { status: 400 });
    const decodedId = decodeId({ id });
    const body = await req.json();
    const patch: Partial<Record<AllowedField, string | null>> = {};

    for (const key of allowedFields) {
      if (key in body) {
        const value = body[key];
        patch[key] = typeof value === "string" ? value : value == null ? null : String(value);
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await updateKuenstler(decodedId, patch);
    return NextResponse.json({ artist: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update artist", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
