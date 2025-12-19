import { NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { PosOrderModel, posSaleTypes } from "@/models/PosOrder";

const lineItemSchema = z.object({
  title: z.string().min(1, "title is required"),
  quantity: z.coerce.number().min(1, "quantity must be at least 1"),
  unitPrice: z.coerce.number().nonnegative("unitPrice must be >= 0"),
  currency: z.string().optional(),
  saleType: z.enum(posSaleTypes).default("unknown"),
  artistShopifyMetaobjectGid: z.string().optional(),
  artistMongoId: z.string().optional(),
  shopifyProductGid: z.string().optional(),
});

const baseSchema = z.object({
  createdAt: z.string().datetime().optional(),
  note: z.string().optional(),
  createdBy: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

function computeTotals(lineItems: z.infer<typeof lineItemSchema>[]) {
  const gross = lineItems.reduce((sum, li) => sum + Number(li.quantity) * Number(li.unitPrice), 0);
  const currency = lineItems[0]?.currency || "EUR";
  return { gross, currency };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = baseSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const lineItems = parsed.data.lineItems.map((li) => ({
      ...li,
      currency: li.currency || "EUR",
    }));
    const totals = computeTotals(lineItems);

    await connectMongo();
    const created = await PosOrderModel.create({
      source: "pos",
      note: parsed.data.note,
      createdBy: parsed.data.createdBy,
      lineItems,
      totals,
      ...(parsed.data.createdAt ? { createdAt: new Date(parsed.data.createdAt) } : {}),
    });

    return NextResponse.json({ order: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create POS order", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await connectMongo();
    const order = await PosOrderModel.findById(id).lean();
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    console.error("Failed to fetch POS order", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = baseSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const lineItems = parsed.data.lineItems.map((li) => ({
      ...li,
      currency: li.currency || "EUR",
    }));
    const totals = computeTotals(lineItems);

    await connectMongo();
    const updated = await PosOrderModel.findByIdAndUpdate(
      id,
      {
        note: parsed.data.note,
        createdBy: parsed.data.createdBy,
        lineItems,
        totals,
        ...(parsed.data.createdAt ? { createdAt: new Date(parsed.data.createdAt) } : {}),
      },
      { new: true },
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ order: updated }, { status: 200 });
  } catch (err) {
    console.error("Failed to update POS order", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
