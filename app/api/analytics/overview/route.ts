import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { PosOrderModel } from "@/models/PosOrder";
import { OrderLineOverrideModel } from "@/models/OrderLineOverride";

type Range = { since: Date | null; until: Date | null };

type SplitBuckets = { print: number; original: number; unknown: number };
type ShopifyLineItem = {
  lineId?: string;
  id?: string;
  lineTotal?: number;
  inferredSaleType?: "print" | "original" | "unknown" | string;
};
type ShopifyOrderAgg = {
  shopifyOrderGid: string;
  totalGross?: number;
  currency?: string;
  lineItems?: ShopifyLineItem[];
};
type PosLineItem = {
  lineId?: string;
  id?: string;
  lineTotal?: number;
  quantity?: number;
  unitPrice?: number;
  saleType?: "print" | "original" | "unknown" | string;
};
type PosOrderAgg = {
  _id: string | { toString(): string };
  totals?: { gross?: number };
  lineItems?: PosLineItem[];
};
type LineOverride = {
  lineKey?: string;
  overrideGross?: number;
  overrideSaleType?: "print" | "original" | "unknown";
  shopifyOrderGid?: string;
  posOrderId?: string;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function resolveRange(params: URLSearchParams): Range {
  const now = new Date();
  const defaultSince = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const since = parseDate(params.get("since")) || defaultSince;
  const until = endOfDay(parseDate(params.get("until")) || now);
  return { since, until };
}

function applyLineSplit(bucket: SplitBuckets, saleType: string | null | undefined, gross: number) {
  if (saleType === "print") bucket.print += gross;
  else if (saleType === "original") bucket.original += gross;
  else bucket.unknown += gross;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { since, until } = resolveRange(searchParams);

    await connectMongo();

    const shopifyMatch: Record<string, unknown> = {};
    const posMatch: Record<string, unknown> = {};

    if (since || until) {
      const createdAtRange: Record<string, Date> = {};
      if (since) createdAtRange.$gte = since;
      if (until) createdAtRange.$lte = until;
      shopifyMatch.createdAt = createdAtRange;
      posMatch.createdAt = createdAtRange;
    }

    const [shopifyOrders, posOrders] = await Promise.all([
      ShopifyOrderCacheModel.aggregate<ShopifyOrderAgg>([
        { $match: shopifyMatch },
        {
          $project: {
            shopifyOrderGid: 1,
            createdAt: 1,
            totalGross: 1,
            currency: 1,
            lineItems: 1,
          },
        },
      ])
        .allowDiskUse(true)
        .exec(),
      PosOrderModel.aggregate<PosOrderAgg>([
        { $match: posMatch },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            lineItems: 1,
            totals: 1,
          },
        },
      ])
        .allowDiskUse(true)
        .exec(),
    ]);

    const shopifyIds = shopifyOrders.map((o) => o.shopifyOrderGid).filter(Boolean);
    const posIds = posOrders.map((o) => (o._id ? String(o._id) : null)).filter(Boolean) as string[];

    const [shopifyOverrides, posOverrides] = await Promise.all([
      shopifyIds.length
        ? OrderLineOverrideModel.find({ orderSource: "shopify", shopifyOrderGid: { $in: shopifyIds } }).lean<LineOverride[]>()
        : [],
      posIds.length
        ? OrderLineOverrideModel.find({ orderSource: "pos", posOrderId: { $in: posIds } }).lean<LineOverride[]>()
        : [],
    ]);

    const shopifyOvMap = new Map<string, LineOverride>();
    shopifyOverrides.forEach((ov) => {
      if (ov.shopifyOrderGid && ov.lineKey) {
        shopifyOvMap.set(`${ov.shopifyOrderGid}:${ov.lineKey}`, ov);
      }
    });

    const posOvMap = new Map<string, LineOverride>();
    posOverrides.forEach((ov) => {
      if (ov.posOrderId && ov.lineKey) {
        posOvMap.set(`${ov.posOrderId}:${ov.lineKey}`, ov);
      }
    });

    let revenue = 0;
    let ordersCount = 0;
    const split: SplitBuckets = { print: 0, original: 0, unknown: 0 };

    for (const order of shopifyOrders) {
      const lines: ShopifyLineItem[] = Array.isArray(order.lineItems) ? order.lineItems : [];
      let orderRevenue = 0;
      lines.forEach((li, idx) => {
        const lineKey = li.lineId || li.id || `${order.shopifyOrderGid}:line:${idx}`;
        const ov = shopifyOvMap.get(`${order.shopifyOrderGid}:${lineKey}`);
        const gross = Number(ov?.overrideGross ?? li.lineTotal ?? 0);
        const saleType = ov?.overrideSaleType ?? li.inferredSaleType ?? "unknown";
        orderRevenue += gross;
        applyLineSplit(split, saleType, gross);
      });

      if (!orderRevenue) {
        orderRevenue = Number(order.totalGross || 0);
      }

      revenue += orderRevenue;
      ordersCount += 1;
    }

    for (const order of posOrders) {
      const lines: PosLineItem[] = Array.isArray(order.lineItems) ? order.lineItems : [];
      let orderRevenue = 0;
      const orderId = order._id ? String(order._id) : "";
      lines.forEach((li, idx) => {
        const lineKey = li.lineId || li.id || `pos:${orderId}:line:${idx}`;
        const ov = posOvMap.get(`${orderId}:${lineKey}`);
        const baseGross = ov?.overrideGross ?? li.lineTotal;
        const computedGross =
          baseGross !== undefined ? Number(baseGross || 0) : Number(li.unitPrice || 0) * Number(li.quantity || 1);
        const gross = Number.isFinite(computedGross) ? computedGross : 0;
        const saleType = ov?.overrideSaleType ?? li.saleType ?? "unknown";
        orderRevenue += gross;
        applyLineSplit(split, saleType, gross);
      });

      if (!orderRevenue) {
        orderRevenue = Number(order.totals?.gross || 0);
      }

      revenue += orderRevenue;
      ordersCount += 1;
    }

    const response = {
      totals: {
        revenue,
        orders: ordersCount,
        aov: ordersCount > 0 ? revenue / ordersCount : 0,
      },
      split: {
        printsRevenue: split.print,
        originalsRevenue: split.original,
        unknownRevenue: split.unknown,
      },
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("Failed to load analytics overview", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
