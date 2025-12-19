import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { PosOrderModel } from "@/models/PosOrder";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { z } from "zod";

const createPosOrderSchema = z.object({
  title: z.string().min(1, "title is required"),
  gross: z.coerce.number().positive("gross must be greater than 0"),
  currency: z.string().default("EUR"),
  note: z.string().optional(),
});

type NormalizedOrder = {
  id: string;
  source: "shopify" | "pos";
  createdAt: string;
  label: string;
  gross: number;
  currency: string;
  artistMetaobjectGids: string[];
  unassignedCount: number;
  lineItemCount: number;
  status?: string | null;
};

function parseDate(input?: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") as "shopify" | "pos" | null;
    const artistMetaobjectId = searchParams.get("artistMetaobjectId")?.trim() || null;
    const start = parseDate(searchParams.get("start"));
    const end = parseDate(searchParams.get("end"));
    const includeShopify = !source || source === "shopify";
    const includePos = !source || source === "pos";

    await connectMongo();

    const orders: NormalizedOrder[] = [];

    if (includeShopify) {
      const filter: Record<string, any> = {};
      if (start || end) {
        filter.createdAt = {};
        if (start) filter.createdAt.$gte = start;
        if (end) filter.createdAt.$lte = new Date(new Date(end).getTime() + 24 * 60 * 60 * 1000);
      }
      const docs = await ShopifyOrderCacheModel.find(filter).sort({ createdAt: -1 }).lean();
      for (const doc of docs) {
        const lineItems = Array.isArray(doc.lineItems) ? doc.lineItems : [];
        const artistIds = Array.from(
          new Set(
            lineItems
              .map((l: any) => l.artistMetaobjectGid)
              .filter((v: any) => typeof v === "string" && v.length > 0),
          ),
        );
        const unassigned = lineItems.filter((l: any) => !l.artistMetaobjectGid).length;
        const normalized: NormalizedOrder = {
          id: String(doc._id || doc.shopifyOrderGid),
          source: "shopify",
          createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
          label: doc.orderName || doc.shopifyOrderGid,
          gross: Number(doc.totalGross || 0),
          currency: doc.currency || "EUR",
          artistMetaobjectGids: artistIds,
          unassignedCount: unassigned,
          lineItemCount: lineItems.length,
          status: doc.financialStatus || doc.fulfillmentStatus || null,
        };
        orders.push(normalized);
      }
    }

    if (includePos) {
      const filter: Record<string, any> = {};
      if (start || end) {
        filter.createdAt = {};
        if (start) filter.createdAt.$gte = start;
        if (end) filter.createdAt.$lte = new Date(new Date(end).getTime() + 24 * 60 * 60 * 1000);
      }
      const docs = await PosOrderModel.find(filter).sort({ createdAt: -1 }).lean();
      for (const doc of docs) {
        const lineItems = Array.isArray(doc.lineItems) ? doc.lineItems : [];
        const artistIds = Array.from(
          new Set(
            lineItems
              .map((l: any) => l.artistShopifyMetaobjectGid || (l.artistMongoId ? `mongo:${l.artistMongoId}` : null))
              .filter((v: any) => typeof v === "string" && v.length > 0),
          ),
        );
        const unassigned = lineItems.filter((l: any) => !l.artistShopifyMetaobjectGid && !l.artistMongoId).length;
        const normalized: NormalizedOrder = {
          id: String(doc._id),
          source: "pos",
          createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
          label: doc.note || lineItems[0]?.title || "POS order",
          gross: Number(doc.totals?.gross || 0),
          currency: doc.totals?.currency || "EUR",
          artistMetaobjectGids: artistIds,
          unassignedCount: unassigned,
          lineItemCount: lineItems.length,
          status: null,
        };
        orders.push(normalized);
      }
    }

    let filtered = orders;
    if (artistMetaobjectId) {
      if (artistMetaobjectId === "unassigned") {
        filtered = orders.filter((o) => o.unassignedCount > 0);
      } else {
        filtered = orders.filter((o) => o.artistMetaobjectGids.includes(artistMetaobjectId));
      }
    }

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ orders: filtered }, { status: 200 });
  } catch (err) {
    console.error("Failed to list orders", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createPosOrderSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const { title, gross, currency, note } = parsed.data;

    await connectMongo();

    const created = await PosOrderModel.create({
      source: "pos",
      note,
      lineItems: [
        {
          title,
          quantity: 1,
          unitPrice: gross,
          currency,
          saleType: "unknown",
        },
      ],
      totals: { gross, currency },
    });

    return NextResponse.json({ order: created.toObject() }, { status: 201 });
  } catch (err) {
    console.error("Failed to create POS order", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
