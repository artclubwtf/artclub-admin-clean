import { NextResponse } from "next/server";

import { requireArtistV2Context } from "@/lib/artistV2Context";
import { connectMongo } from "@/lib/mongodb";

export async function GET() {
  await connectMongo();
  const context = await requireArtistV2Context();
  if (!context.ok) return context.response;

  const { user, canonicalArtist } = context;
  return NextResponse.json(
    {
      ok: true,
      me: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        artistKey: user.artistKey,
        onboardingComplete: user.onboardingComplete === true,
        displayName: canonicalArtist.displayName || user.name || "",
        handle: canonicalArtist.handle || user.artistKey,
      },
    },
    { status: 200 },
  );
}
