import { NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { ContractTermsModel } from "@/models/ContractTerms";

const termsSchema = z.object({
  kunstlerId: z.string().min(1, "kunstlerId is required"),
  printCommissionPct: z.coerce
    .number({ invalid_type_error: "printCommissionPct must be a number" })
    .min(0, "printCommissionPct must be between 0 and 100")
    .max(100, "printCommissionPct must be between 0 and 100"),
  originalCommissionPct: z.coerce
    .number({ invalid_type_error: "originalCommissionPct must be a number" })
    .min(0, "originalCommissionPct must be between 0 and 100")
    .max(100, "originalCommissionPct must be between 0 and 100"),
  effectiveFrom: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kunstlerId = searchParams.get("kunstlerId");

    if (!kunstlerId) {
      return NextResponse.json({ error: "kunstlerId is required" }, { status: 400 });
    }

    await connectMongo();
    const terms = await ContractTermsModel.findOne({ kunstlerId }).lean();

    return NextResponse.json({ terms }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch contract terms", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = termsSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues?.[0];
      return NextResponse.json({ error: firstIssue?.message || "Invalid payload" }, { status: 400 });
    }

    const { kunstlerId, printCommissionPct, originalCommissionPct, effectiveFrom, notes } = parsed.data;

    await connectMongo();
    const terms = await ContractTermsModel.findOneAndUpdate(
      { kunstlerId },
      {
        kunstlerId,
        printCommissionPct,
        originalCommissionPct,
        effectiveFrom: effectiveFrom ?? null,
        notes: notes ?? "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({ terms }, { status: 200 });
  } catch (err) {
    console.error("Failed to upsert contract terms", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
