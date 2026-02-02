import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { PosOrderModel } from "@/models/PosOrder";
import { OrderLineOverrideModel } from "@/models/OrderLineOverride";

type Range = { since: Date | null; until: Date | null };

type LocationBucket = { country: string; city?: string; orders: number; revenue: number };
type AddressLike = {
  country?: string;
  countryCode?: string;
  country_code?: string;
  city?: string;
  province?: string;
  region?: string;
};
type OrderWithAddress = {
  shippingAddress?: AddressLike;
  billingAddress?: AddressLike;
  shipping_address?: AddressLike;
  billing_address?: AddressLike;
};
type ShopifyLineItem = { lineId?: string; id?: string; lineTotal?: number };
type ShopifyOrderAgg = {
  shopifyOrderGid: string;
  totalGross?: number;
  lineItems?: ShopifyLineItem[];
} & OrderWithAddress;
type PosLineItem = { lineId?: string; id?: string; lineTotal?: number; quantity?: number; unitPrice?: number };
type PosOrderAgg = {
  _id: string | { toString(): string };
  totals?: { gross?: number };
  lineItems?: PosLineItem[];
} & OrderWithAddress;
type LineOverride = {
  lineKey?: string;
  overrideGross?: number;
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

function resolveLocation(order: OrderWithAddress) {
  const shipping = order?.shippingAddress || order?.shipping_address || null;
  const billing = order?.billingAddress || order?.billing_address || null;
  const source = shipping || billing || {};

  const countryRaw = source.country || source.countryCode || source.country_code || "";
  const cityRaw = source.city || source.province || source.region || "";

  const country = typeof countryRaw === "string" ? countryRaw.trim() : "";
  const city = typeof cityRaw === "string" ? cityRaw.trim() : "";

  return {
    country: country || "Unknown",
    city: city || "Unknown",
  };
}

function increment(map: Map<string, LocationBucket>, key: string, value: LocationBucket) {
  const existing = map.get(key);
  if (existing) {
    existing.orders += value.orders;
    existing.revenue += value.revenue;
  } else {
    map.set(key, { ...value });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { since, until } = resolveRange(searchParams);
    const limitParam = Number(searchParams.get("limit") || 5);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 50) : 5;

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
            lineItems: 1,
            shippingAddress: 1,
            billingAddress: 1,
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
            shippingAddress: 1,
            billingAddress: 1,
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

    const countryMap = new Map<string, LocationBucket>();
    const cityMap = new Map<string, LocationBucket>();

    for (const order of shopifyOrders) {
      const lines: ShopifyLineItem[] = Array.isArray(order.lineItems) ? order.lineItems : [];
      let orderRevenue = 0;
      lines.forEach((li, idx) => {
        const lineKey = li.lineId || li.id || `${order.shopifyOrderGid}:line:${idx}`;
        const ov = shopifyOvMap.get(`${order.shopifyOrderGid}:${lineKey}`);
        const gross = Number(ov?.overrideGross ?? li.lineTotal ?? 0);
        orderRevenue += gross;
      });

      if (!orderRevenue) {
        orderRevenue = Number(order.totalGross || 0);
      }

      const loc = resolveLocation(order);
      increment(countryMap, loc.country, { country: loc.country, orders: 1, revenue: orderRevenue });
      const cityKey = `${loc.country}__${loc.city}`;
      increment(cityMap, cityKey, { country: loc.country, city: loc.city, orders: 1, revenue: orderRevenue });
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
        orderRevenue += gross;
      });

      if (!orderRevenue) {
        orderRevenue = Number(order.totals?.gross || 0);
      }

      const loc = resolveLocation(order);
      increment(countryMap, loc.country, { country: loc.country, orders: 1, revenue: orderRevenue });
      const cityKey = `${loc.country}__${loc.city}`;
      increment(cityMap, cityKey, { country: loc.country, city: loc.city, orders: 1, revenue: orderRevenue });
    }

    const countries = Array.from(countryMap.values()).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders).slice(0, limit);
    const cities = Array.from(cityMap.values()).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders).slice(0, limit);

    return NextResponse.json(
      {
        countries,
        cities,
        updatedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to load analytics locations", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
