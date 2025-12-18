import { NextResponse } from "next/server";

const message = "Artworks are managed in Shopify. This MongoDB endpoint has been disabled.";

export async function GET() {
  return NextResponse.json({ error: message }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: message }, { status: 410 });
}
