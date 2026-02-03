import { NextResponse } from "next/server";

import { connectMongo } from "@/lib/mongodb";
import { ArtworkSignalsModel } from "@/models/ArtworkSignals";

type ViewsPayload = {
  productGid?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ViewsPayload | null;
    const productGid = typeof body?.productGid === "string" ? body.productGid.trim() : "";
    if (!productGid) {
      return NextResponse.json({ error: "productGid is required" }, { status: 400 });
    }

    await connectMongo();

    await ArtworkSignalsModel.updateOne(
      { productGid },
      {
        $setOnInsert: { productGid },
        $inc: { viewsCount: 1 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Failed to record view", err);
    const message = err instanceof Error ? err.message : "Failed to record view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
