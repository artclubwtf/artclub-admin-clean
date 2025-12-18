import { NextResponse } from "next/server";
import { fetchKuenstler } from "@/lib/shopify";

export async function GET() {
  try {
    const artists = await fetchKuenstler();
    return NextResponse.json({ artists }, { status: 200 });
  } catch (err) {
    console.error("Failed to list artists", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
