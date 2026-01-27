import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { createApplicationToken } from "@/lib/applicationAuth";
import { ArtistApplicationModel } from "@/models/ArtistApplication";

const APPLICATION_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST() {
  try {
    await connectMongo();

    const { token, hash } = createApplicationToken();
    const expiresAt = new Date(Date.now() + APPLICATION_TOKEN_TTL_MS);

    const created = await ArtistApplicationModel.create({
      status: "draft",
      applicationTokenHash: hash,
      expiresAt,
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
