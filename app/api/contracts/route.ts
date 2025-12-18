import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ContractModel } from "@/models/Contract";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kunstlerId = searchParams.get("kunstlerId");

    if (!kunstlerId) {
      return NextResponse.json({ error: "kunstlerId is required" }, { status: 400 });
    }

    await connectMongo();
    const contracts = await ContractModel.find({ kunstlerId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ contracts }, { status: 200 });
  } catch (err) {
    console.error("Failed to list contracts", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
