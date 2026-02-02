import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { PayoutDetailsModel, createPayoutDetailsSchema } from "@/models/PayoutDetails";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kunstlerId = searchParams.get("kunstlerId");
    if (!kunstlerId) {
      return NextResponse.json({ error: "kunstlerId is required" }, { status: 400 });
    }

    await connectMongo();
    const payout = await PayoutDetailsModel.findOne({ kunstlerId }).lean();
    return NextResponse.json({ payout: payout || null }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch payout details", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = createPayoutDetailsSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await connectMongo();
    const payout = await PayoutDetailsModel.findOneAndUpdate(
      { kunstlerId: parsed.data.kunstlerId },
      parsed.data,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({ payout }, { status: 200 });
  } catch (err) {
    console.error("Failed to upsert payout details", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
