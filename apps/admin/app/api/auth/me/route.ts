import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        artistId: session.user.artistId,
        artistKey: (session.user as { artistKey?: string }).artistKey,
        onboardingComplete: (session.user as { onboardingComplete?: boolean }).onboardingComplete === true,
        mustChangePassword: session.user.mustChangePassword === true,
      },
    });
  } catch (err) {
    console.error("Failed to load auth session", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
