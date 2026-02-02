import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { connectMongo } from "@/lib/mongodb";
import { createApplicationToken } from "@/lib/applicationAuth";
import { resolveShopDomain } from "@/lib/shopDomain";
import { ArtistApplicationModel } from "@/models/ArtistApplication";
import { UserModel } from "@/models/User";

const PASSWORD_HASH_ROUNDS = 12;
const APPLICATION_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const REAPPLY_MONTHS = 6;

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2),
});

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;
    const fullName = parsed.data.fullName;

    const shopDomain = resolveShopDomain();
    if (!shopDomain) {
      return NextResponse.json({ error: "Missing Shopify shop domain" }, { status: 500 });
    }

    await connectMongo();

    const existingUser = await UserModel.findOne({ email }).lean();
    if (existingUser) {
      return NextResponse.json({ error: "Account already exists. Please log in." }, { status: 409 });
    }

    const existingRegistration = await ArtistApplicationModel.findOne({
      "personal.email": { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existingRegistration?.status === "rejected") {
      const rejectedBase =
        existingRegistration.rejectedAt || existingRegistration.updatedAt || existingRegistration.createdAt || new Date();
      const reapplyAfter = addMonths(new Date(rejectedBase), REAPPLY_MONTHS);
      if (reapplyAfter.getTime() > Date.now()) {
        return NextResponse.json(
          { error: `Re-register available after ${reapplyAfter.toDateString()}.`, reapplyAfter },
          { status: 403 },
        );
      }
    }

    let registration = null;
    if (existingRegistration && ["draft", "submitted", "in_review"].includes(existingRegistration.status)) {
      registration = await ArtistApplicationModel.findById(existingRegistration._id);
    }

    if (!registration) {
      const { hash } = createApplicationToken();
      const expiresAt = new Date(Date.now() + APPLICATION_TOKEN_TTL_MS);
      registration = await ArtistApplicationModel.create({
        status: "draft",
        applicationTokenHash: hash,
        expiresAt,
        personal: { email, fullName },
      });
    } else {
      registration.personal = {
        ...registration.personal,
        email,
        fullName: registration.personal?.fullName || fullName,
      };
      await registration.save();
    }

    const passwordHash = await hash(password, PASSWORD_HASH_ROUNDS);
    const user = await UserModel.create({
      email,
      role: "artist",
      passwordHash,
      shopDomain,
      pendingRegistrationId: registration._id,
      onboardingStatus: "pending",
      isActive: true,
    });

    return NextResponse.json(
      {
        ok: true,
        registrationId: registration._id.toString(),
        userId: user._id.toString(),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Onboarding signup failed", err);
    return NextResponse.json({ error: "Onboarding signup failed" }, { status: 500 });
  }
}
