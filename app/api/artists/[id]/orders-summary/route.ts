import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { ContractTermsModel } from "@/models/ContractTerms";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { PosOrderModel } from "@/models/PosOrder";
import { PayoutTransactionModel } from "@/models/PayoutTransaction";
import { OrderLineOverrideModel } from "@/models/OrderLineOverride";

type Totals = {
  printGross: number;
  originalGross: number;
  unknownGross: number;
  earned: number;
  paid: number;
  outstanding: number;
};

const emptyTotals: Totals = {
  printGross: 0,
  originalGross: 0,
  unknownGross: 0,
  earned: 0,
  paid: 0,
  outstanding: 0,
};

function computeEarned(printGross: number, originalGross: number, unknownGross: number, printPct: number, originalPct: number) {
  // Unknown is treated like original until explicitly classified.
  const effectiveOriginal = originalGross + unknownGross;
  return printGross * (printPct / 100) + effectiveOriginal * (originalPct / 100);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(_.url);
    const includeUnpaid = searchParams.get("includeUnpaid") === "true";
    const includeCancelled = searchParams.get("includeCancelled") === "true";
    await connectMongo();

    const artist = await ArtistModel.findById(id).lean();
    if (!artist) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    const metaobjectId = artist.shopifySync?.metaobjectId;
    const terms = await ContractTermsModel.findOne({ kunstlerId: id }).lean();
    const printPct = terms?.printCommissionPct ?? 0;
    const originalPct = terms?.originalCommissionPct ?? 0;

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orderEntries: {
      id: string;
      source: "shopify" | "pos";
      createdAt: string;
      label: string;
      currency: string;
      printGross: number;
      originalGross: number;
      unknownGross: number;
    }[] = [];

    if (metaobjectId) {
        const shopifyOrders = await ShopifyOrderCacheModel.find({
          $or: [
            { "allocations.artistMetaobjectGid": metaobjectId },
            { "lineItems.artistMetaobjectGid": metaobjectId },
          ],
        })
          .sort({ createdAt: -1 })
          .lean();

      const shopifyIds = shopifyOrders.map((doc) => doc.shopifyOrderGid).filter(Boolean);
      const overrides = await OrderLineOverrideModel.find({ orderSource: "shopify", shopifyOrderGid: { $in: shopifyIds } }).lean();
      const overrideMap = new Map<string, any>();
      overrides.forEach((ov) => ov.lineKey && overrideMap.set(`${ov.shopifyOrderGid}:${ov.lineKey}`, ov));

      for (const doc of shopifyOrders) {
        const status = (doc.financialStatus || "").toLowerCase();
        const isPaid = status.includes("paid");
        const isCancelled = Boolean(doc.cancelledAt) || Number(doc.refundedTotalGross || 0) > 0;
        if (!includeUnpaid && !isPaid) continue;
        if (!includeCancelled && isCancelled) continue;

        const lineItems: any[] = Array.isArray(doc.lineItems) ? doc.lineItems : [];
        let printGross = 0;
        let originalGross = 0;
        let unknownGross = 0;

        lineItems.forEach((li, idx) => {
          const lineKey = li.lineId || li.id || `${doc.shopifyOrderGid}:line:${idx}`;
          const ov = overrideMap.get(`${doc.shopifyOrderGid}:${lineKey}`);
          const artistMatch = ov?.overrideArtistMetaobjectGid !== undefined ? ov.overrideArtistMetaobjectGid === metaobjectId : li.artistMetaobjectGid === metaobjectId;
          if (!artistMatch) return;
          const saleType = ov?.overrideSaleType || li.inferredSaleType || "unknown";
          const gross = ov?.overrideGross !== undefined ? ov.overrideGross : Number(li.lineTotal || 0);
          if (saleType === "print") printGross += gross;
          else if (saleType === "original") originalGross += gross;
          else unknownGross += gross;
        });

        if (printGross + originalGross + unknownGross === 0) continue;

        orderEntries.push({
          id: String(doc._id || doc.shopifyOrderGid),
          source: "shopify",
          createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
          label: doc.orderName || doc.shopifyOrderGid || "Order",
          currency: doc.currency || "EUR",
          printGross,
          originalGross,
          unknownGross,
        });
      }
    }

    const posOrders = await PosOrderModel.find({
      $or: [{ "lineItems.artistShopifyMetaobjectGid": metaobjectId || "__none__" }, { "lineItems.artistMongoId": id }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const posIds = posOrders.map((doc) => doc._id?.toString()).filter(Boolean);
    const posOverrides = await OrderLineOverrideModel.find({ orderSource: "pos", posOrderId: { $in: posIds } }).lean();
    const posOverrideMap = new Map<string, any>();
    posOverrides.forEach((ov) => ov.lineKey && posOverrideMap.set(`${ov.posOrderId}:${ov.lineKey}`, ov));

    for (const doc of posOrders) {
      const lineItems: any[] = Array.isArray(doc.lineItems) ? doc.lineItems : [];
      let printGross = 0;
      let originalGross = 0;
      let unknownGross = 0;
      lineItems.forEach((li, idx) => {
        const lineKey = li.lineId || li.id || `pos:${doc._id}:line:${idx}`;
        const ov = posOverrideMap.get(`${doc._id}:${lineKey}`);
        const artistMatch =
          ov?.overrideArtistMetaobjectGid !== undefined
            ? ov.overrideArtistMetaobjectGid === metaobjectId
            : li.artistShopifyMetaobjectGid === metaobjectId || li.artistMongoId === id;
        if (!artistMatch) return;
        const saleType = ov?.overrideSaleType || li.saleType || "unknown";
        const gross =
          ov?.overrideGross !== undefined ? ov.overrideGross : Number(li.quantity || 0) * Number(li.unitPrice || 0);
        if (saleType === "print") printGross += gross;
        else if (saleType === "original") originalGross += gross;
        else unknownGross += gross;
      });
      if (printGross + originalGross + unknownGross === 0) continue;
      orderEntries.push({
        id: String(doc._id),
        source: "pos",
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
        label: doc.note || "POS order",
        currency: doc.totals?.currency || "EUR",
        printGross,
        originalGross,
        unknownGross,
      });
    }

    const payoutFilter = metaobjectId
      ? { $or: [{ artistMongoId: id }, { artistMetaobjectGid: metaobjectId }] }
      : { artistMongoId: id };

    const payouts = await PayoutTransactionModel.find(payoutFilter).lean();

    const totalsAll = orderEntries.reduce(
      (acc, entry) => {
        acc.printGross += entry.printGross;
        acc.originalGross += entry.originalGross;
        acc.unknownGross += entry.unknownGross;
        return acc;
      },
      { ...emptyTotals },
    );
    totalsAll.earned = computeEarned(totalsAll.printGross, totalsAll.originalGross, totalsAll.unknownGross, printPct, originalPct);
    totalsAll.paid = payouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    totalsAll.outstanding = totalsAll.earned - totalsAll.paid;

    const totals30 = orderEntries
      .filter((e) => new Date(e.createdAt) >= since30)
      .reduce(
        (acc, entry) => {
          acc.printGross += entry.printGross;
          acc.originalGross += entry.originalGross;
          acc.unknownGross += entry.unknownGross;
          return acc;
        },
        { ...emptyTotals },
      );
    totals30.earned = computeEarned(totals30.printGross, totals30.originalGross, totals30.unknownGross, printPct, originalPct);
    totals30.paid = totalsAll.paid; // payouts not filtered by date for outstanding calculations
    totals30.outstanding = totals30.earned - totals30.paid;

    const orders = orderEntries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json(
      {
        orders,
        totals: { allTime: totalsAll, last30d: totals30 },
        payouts: payouts.map((p) => ({
          id: String(p._id),
          amount: p.amount,
          currency: p.currency,
          method: p.method,
          createdAt: p.createdAt,
          note: p.note,
        })),
        commissionTerms: terms ? { printCommissionPct: terms.printCommissionPct, originalCommissionPct: terms.originalCommissionPct } : null,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to fetch artist orders summary", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
