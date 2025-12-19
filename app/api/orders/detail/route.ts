import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { PosOrderModel } from "@/models/PosOrder";
import { OrderLineOverrideModel } from "@/models/OrderLineOverride";

type Source = "shopify" | "pos";

function applyOverridesToLine(line: any, override: any) {
  if (!override) return line;
  const next = { ...line };
  if (override.overrideArtistMetaobjectGid !== undefined) {
    next.artistMetaobjectGid = override.overrideArtistMetaobjectGid || null;
    next.artistShopifyMetaobjectGid = override.overrideArtistMetaobjectGid || null;
  }
  if (override.overrideSaleType !== undefined) {
    next.inferredSaleType = override.overrideSaleType;
    next.saleType = override.overrideSaleType;
  }
  if (override.overrideGross !== undefined) {
    next.lineTotal = override.overrideGross;
    next.unitPrice = override.overrideGross;
  }
  return next;
}

function getLineKey(source: Source, orderId: string, line: any, index: number) {
  if (source === "shopify") {
    return line.lineId || line.id || `${orderId}:line:${index}`;
  }
  return line.lineId || line.id || `pos:${orderId}:line:${index}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const source = (searchParams.get("source") as Source) || null;
    const id = searchParams.get("id");
    if (!source || !id) {
      return NextResponse.json({ error: "source and id are required" }, { status: 400 });
    }

    await connectMongo();

    let orderDoc: any;
    if (source === "shopify") {
      orderDoc = await ShopifyOrderCacheModel.findOne({ shopifyOrderGid: id }).lean();
    } else {
      orderDoc = await PosOrderModel.findById(id).lean();
    }
    if (!orderDoc) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const overrides = await OrderLineOverrideModel.find(
      source === "shopify" ? { orderSource: source, shopifyOrderGid: id } : { orderSource: source, posOrderId: id },
    ).lean();
    const overrideMap = new Map<string, any>();
    for (const ov of overrides) {
      if (ov.lineKey) overrideMap.set(ov.lineKey, ov);
    }

    const lineItems: any[] = Array.isArray(orderDoc.lineItems) ? orderDoc.lineItems : [];
    const lines = lineItems.map((line, idx) => {
      const lineKey = getLineKey(source, id, line, idx);
      const applied = applyOverridesToLine(line, overrideMap.get(lineKey));
      const gross = Number(applied.lineTotal || applied.unitPrice || 0);
      return {
        lineKey,
        title: line.title || "Line item",
        variantTitle: line.variantTitle || null,
        quantity: Number(line.quantity || 0),
        saleType: applied.inferredSaleType || applied.saleType || "unknown",
        artistMetaobjectGid: applied.artistMetaobjectGid || applied.artistShopifyMetaobjectGid || null,
        gross,
        override: overrideMap.get(lineKey) || null,
      };
    });

    const total = lines.reduce((sum, l) => sum + Number(l.gross || 0), 0);

    return NextResponse.json(
      {
        order: {
          id,
          source,
          label: orderDoc.orderName || orderDoc.shopifyOrderGid || orderDoc.note || "Order",
          createdAt: orderDoc.createdAt,
          currency: orderDoc.currency || orderDoc.totals?.currency || "EUR",
          totalGross: total,
          lines,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to fetch order detail", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
