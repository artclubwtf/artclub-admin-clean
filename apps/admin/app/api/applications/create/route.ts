import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { createApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

const APPLICATION_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const REAPPLY_MONTHS = 6;

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string } | null;
    const email = normalizeEmail(body?.email);

    await connectMongo();

    if (email) {
      const existing = await ArtistApplicationModel.findOne({
        "personal.email": { $regex: `^${escapeRegex(email)}$`, $options: "i" },
      })
        .sort({ createdAt: -1 })
        .lean();

      if (existing?.status === "submitted" || existing?.status === "in_review") {
        return NextResponse.json({ error: "We’re reviewing your registration." }, { status: 403 });
      }

      if (existing?.status === "rejected") {
        const rejectedBase = existing.rejectedAt || existing.updatedAt || existing.createdAt || new Date();
        const reapplyAfter = addMonths(new Date(rejectedBase), REAPPLY_MONTHS);
        if (reapplyAfter.getTime() > Date.now()) {
          return NextResponse.json(
            { error: `Re-register available after ${reapplyAfter.toDateString()}.`, reapplyAfter },
            { status: 403 },
          );
        }
      }
    }

    const { token, hash } = createApplicationToken();
    const expiresAt = new Date(Date.now() + APPLICATION_TOKEN_TTL_MS);

    const created = await ArtistApplicationModel.create({
      status: "draft",
      applicationTokenHash: hash,
      expiresAt,
      ...(email
        ? {
            personal: {
              email,
            },
          }
        : {}),
    });

    return NextResponse.json(
      {
        applicationId: created._id.toString(),
        token,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to create application", err);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }
}
