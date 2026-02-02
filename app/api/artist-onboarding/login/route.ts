import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";

import { connectMongo } from "@/lib/mongodb";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { UserModel } from "@/models/User";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    await connectMongo();
    const user = await UserModel.findOne({ email, role: "artist" });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    let registrationId = user.pendingRegistrationId?.toString() || null;
    if (!registrationId && user.artistId) {
      return NextResponse.json({ ok: true, redirectTo: "/artist" }, { status: 200 });
    }

    if (!registrationId) {
      const registration = await ArtistApplicationModel.findOne({ "personal.email": email }).sort({ createdAt: -1 }).lean();
      registrationId = registration?._id.toString() || null;
      if (registrationId && Types.ObjectId.isValid(registrationId)) {
        user.pendingRegistrationId = new Types.ObjectId(registrationId);
        user.onboardingStatus = user.onboardingStatus || "pending";
        await user.save();
      }
    }

    const redirectTo = registrationId ? `/apply/${encodeURIComponent(registrationId)}/dashboard` : "/apply";
    return NextResponse.json({ ok: true, redirectTo, registrationId }, { status: 200 });
  } catch (err) {
    console.error("Onboarding login failed", err);
    return NextResponse.json({ error: "Onboarding login failed" }, { status: 500 });
  }
}
