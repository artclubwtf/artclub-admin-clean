import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { fetchShopifyOrders } from "@/lib/shopifyOrders";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { orderSaleTypes } from "@/models/ShopifyOrderCache";

type InferredSaleType = (typeof orderSaleTypes)[number];

type CachedLineItem = {
  lineId: string;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  shopifyProductGid: string | null;
  productTags: string[];
  artistMetaobjectGid: string | null;
  inferredSaleType: InferredSaleType;
};

function inferSaleType(tags: string[], variantTitle: string | null): InferredSaleType {
  const lowerTags = tags.map((t) => t.toLowerCase());
  const hasOriginalTag = lowerTags.includes("original");
  const variant = variantTitle?.toLowerCase() ?? "";

  if (hasOriginalTag && (variant.includes("original") || !variantTitle)) {
    return "original";
  }
  if (lowerTags.length > 0) {
    return "print";
  }
  return "unknown";
}

function buildAllocations(lines: CachedLineItem[]) {
  const map = new Map<
    string,
    { artistMetaobjectGid: string; gross: number; saleTypeBreakdown: { printGross: number; originalGross: number } }
  >();

  for (const line of lines) {
    if (!line.artistMetaobjectGid) continue;
    const gross = Number(line.lineTotal || 0);
    const existing =
      map.get(line.artistMetaobjectGid) ??
      { artistMetaobjectGid: line.artistMetaobjectGid, gross: 0, saleTypeBreakdown: { printGross: 0, originalGross: 0 } };

    existing.gross += gross;
    if (line.inferredSaleType === "original") {
      existing.saleTypeBreakdown.originalGross += gross;
    } else if (line.inferredSaleType === "print") {
      existing.saleTypeBreakdown.printGross += gross;
    }
    map.set(line.artistMetaobjectGid, existing);
  }

  return Array.from(map.values());
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const queryLimit = searchParams.get("limit");
    const querySince = searchParams.get("since");

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const limitParam = Number(body.limit ?? queryLimit ?? 25);
    const since = (body.since ?? querySince ?? "").trim() || null;
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.floor(limitParam)), 100) : 25;

    const { orders } = await fetchShopifyOrders({ limit, since });

    await connectMongo();

    let importedCount = 0;
    const errors: string[] = [];
    const importedIds: string[] = [];

    for (const order of orders) {
      try {
        const lines: CachedLineItem[] = order.lineItems.map((line, idx) => {
          const inferredSaleType = inferSaleType(line.productTags, line.variantTitle);
          const lineId = line.id || `${order.id}:line:${idx}`;
          return {
            lineId,
            title: line.title,
            variantTitle: line.variantTitle,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            shopifyProductGid: line.productId,
            productTags: line.productTags,
            artistMetaobjectGid: line.artistMetaobjectGid,
            inferredSaleType,
          };
        });

        const allocations = buildAllocations(lines);

        await ShopifyOrderCacheModel.findOneAndUpdate(
          { shopifyOrderGid: order.id },
          {
            source: "shopify",
            shopifyOrderGid: order.id,
            orderName: order.name || order.id,
            createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
            processedAt: order.processedAt ? new Date(order.processedAt) : undefined,
            financialStatus: order.financialStatus,
            fulfillmentStatus: order.fulfillmentStatus,
            cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : undefined,
            refundedTotalGross: order.refundedTotalGross ?? 0,
            currency: order.currency || "EUR",
            totalGross: Number.isFinite(order.totalGross) ? order.totalGross : 0,
            lineItems: lines,
            allocations,
            lastImportedAt: new Date(),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        importedCount += 1;
        importedIds.push(order.id);
      } catch (err: any) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Order ${order.id || order.name || "unknown"}: ${message}`);
      }
    }

    return NextResponse.json(
      {
        importedCount,
        skippedCount: errors.length,
        errors,
        importedOrderIds: importedIds,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import Shopify orders";
    console.error("Failed to import Shopify orders", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
