import { NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { PayoutTransactionModel, payoutMethods } from "@/models/PayoutTransaction";

const createSchema = z.object({
  kunstlerId: z.string().min(1, "kunstlerId is required"),
  artistMetaobjectGid: z.string().optional(),
  amount: z.coerce.number().positive("amount must be positive"),
  currency: z.string().default("EUR"),
  method: z.enum(payoutMethods),
  reference: z.string().optional(),
  note: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    await connectMongo();
    const created = await PayoutTransactionModel.create({
      artistMongoId: parsed.data.kunstlerId,
      artistMetaobjectGid: parsed.data.artistMetaobjectGid,
      amount: parsed.data.amount,
      currency: parsed.data.currency || "EUR",
      method: parsed.data.method,
      reference: parsed.data.reference,
      note: parsed.data.note,
      ...(parsed.data.createdAt ? { createdAt: new Date(parsed.data.createdAt) } : {}),
    });

    return NextResponse.json({ payout: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create payout transaction", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
