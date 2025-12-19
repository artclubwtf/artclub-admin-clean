import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { ContractModel } from "@/models/Contract";
import { PayoutDetailsModel } from "@/models/PayoutDetails";
import { ContractTermsModel } from "@/models/ContractTerms";
import { ShopifyOrderCacheModel } from "@/models/ShopifyOrderCache";
import { PosOrderModel } from "@/models/PosOrder";
import { PayoutTransactionModel } from "@/models/PayoutTransaction";
import { OrderLineOverrideModel } from "@/models/OrderLineOverride";

const stageUnderContract = "Under Contract";

type ArtistTotals = {
  print: number;
  original: number;
  unknown: number;
  paid: number;
  earned: number;
};

function computeEarned(print: number, original: number, unknown: number, printPct: number, originalPct: number) {
  // Unknown treated as original until classified.
  const effectiveOriginal = original + unknown;
  return print * (printPct / 100) + effectiveOriginal * (originalPct / 100);
}

export async function GET() {
  try {
    await connectMongo();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [ordersTodayShopify, ordersTodayPos] = await Promise.all([
      ShopifyOrderCacheModel.countDocuments({ createdAt: { $gte: todayStart } }),
      PosOrderModel.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);

    const artists = await ArtistModel.find({ stage: stageUnderContract }).lean();
    const artistIds = artists.map((a) => String(a._id));
    const artistMetaIds = artists.map((a) => a.shopifySync?.metaobjectId).filter(Boolean) as string[];
    const metaSet = new Set(artistMetaIds);
    const artistIdByMeta = new Map<string, string>();
    artists.forEach((a) => {
      if (a.shopifySync?.metaobjectId) artistIdByMeta.set(a.shopifySync.metaobjectId, String(a._id));
    });

    const [contracts, payoutDetails, terms, payouts] = await Promise.all([
      ContractModel.find({ kunstlerId: { $in: artistIds } }).lean(),
      PayoutDetailsModel.find({ kunstlerId: { $in: artistIds } }).lean(),
      ContractTermsModel.find({ kunstlerId: { $in: artistIds } }).lean(),
      PayoutTransactionModel.find({
        $or: [{ artistMongoId: { $in: artistIds } }, { artistMetaobjectGid: { $in: artistMetaIds } }],
      }).lean(),
    ]);

    const termsByArtist = new Map<string, { printPct: number; originalPct: number }>();
    terms.forEach((t) => termsByArtist.set(t.kunstlerId, { printPct: t.printCommissionPct, originalPct: t.originalCommissionPct }));

    const payoutsByArtist = new Map<string, number>();
    payouts.forEach((p) => {
      const byId = p.artistMongoId ? String(p.artistMongoId) : undefined;
      const byMeta = p.artistMetaobjectGid ? artistIdByMeta.get(p.artistMetaobjectGid) : undefined;
      const key = byId || byMeta;
      if (!key) return;
      payoutsByArtist.set(key, (payoutsByArtist.get(key) || 0) + Number(p.amount || 0));
    });

    // Shopify orders relevant to these artists
    const shopifyOrders = await ShopifyOrderCacheModel.find({
      $or: [
        { "lineItems.artistMetaobjectGid": { $in: artistMetaIds } },
        { "allocations.artistMetaobjectGid": { $in: artistMetaIds } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();
    const shopifyIds = shopifyOrders.map((o) => o.shopifyOrderGid).filter(Boolean);
    const shopifyOverrides = await OrderLineOverrideModel.find({ orderSource: "shopify", shopifyOrderGid: { $in: shopifyIds } }).lean();
    const shopifyOvMap = new Map<string, any>();
    shopifyOverrides.forEach((ov) => {
      if (ov.shopifyOrderGid && ov.lineKey) shopifyOvMap.set(`${ov.shopifyOrderGid}:${ov.lineKey}`, ov);
    });

    const posOrders = await PosOrderModel.find({
      $or: [{ "lineItems.artistShopifyMetaobjectGid": { $in: artistMetaIds } }, { "lineItems.artistMongoId": { $in: artistIds } }],
    })
      .sort({ createdAt: -1 })
      .lean();
    const posIds = posOrders.map((o) => String(o._id));
    const posOverrides = await OrderLineOverrideModel.find({ orderSource: "pos", posOrderId: { $in: posIds } }).lean();
    const posOvMap = new Map<string, any>();
    posOverrides.forEach((ov) => {
      if (ov.posOrderId && ov.lineKey) posOvMap.set(`${ov.posOrderId}:${ov.lineKey}`, ov);
    });

    const totalsByArtist = new Map<string, ArtistTotals>();
    const ensureTotals = (artistId: string) => {
      if (!totalsByArtist.has(artistId)) {
        totalsByArtist.set(artistId, { print: 0, original: 0, unknown: 0, paid: payoutsByArtist.get(artistId) || 0, earned: 0 });
      }
      return totalsByArtist.get(artistId)!;
    };

    // Shopify lines with overrides
    for (const order of shopifyOrders) {
      const lines: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
      lines.forEach((li, idx) => {
        const baseKey = li.lineId || li.id || `${order.shopifyOrderGid}:line:${idx}`;
        const ov = shopifyOvMap.get(`${order.shopifyOrderGid}:${baseKey}`);
        const artistMeta =
          ov?.overrideArtistMetaobjectGid !== undefined ? ov.overrideArtistMetaobjectGid : li.artistMetaobjectGid || null;
        if (!artistMeta || !metaSet.has(artistMeta)) return;
        const artistId = artistIdByMeta.get(artistMeta);
        if (!artistId) return;
        const saleType = ov?.overrideSaleType || li.inferredSaleType || "unknown";
        const gross = ov?.overrideGross !== undefined ? ov.overrideGross : Number(li.lineTotal || 0);
        const bucket = ensureTotals(artistId);
        if (saleType === "print") bucket.print += gross;
        else if (saleType === "original") bucket.original += gross;
        else bucket.unknown += gross;
      });
    }

    // POS lines with overrides
    for (const order of posOrders) {
      const lines: any[] = Array.isArray(order.lineItems) ? order.lineItems : [];
      lines.forEach((li, idx) => {
        const baseKey = li.lineId || li.id || `pos:${order._id}:line:${idx}`;
        const ov = posOvMap.get(`${order._id}:${baseKey}`);
        const artistMeta =
          ov?.overrideArtistMetaobjectGid !== undefined
            ? ov.overrideArtistMetaobjectGid
            : li.artistShopifyMetaobjectGid || null;
        const artistId = artistMeta ? artistIdByMeta.get(artistMeta) : li.artistMongoId ? String(li.artistMongoId) : null;
        if (!artistId) return;
        const saleType = ov?.overrideSaleType || li.saleType || "unknown";
        const gross =
          ov?.overrideGross !== undefined ? ov.overrideGross : Number(li.quantity || 0) * Number(li.unitPrice || 0);
        const bucket = ensureTotals(artistId);
        if (saleType === "print") bucket.print += gross;
        else if (saleType === "original") bucket.original += gross;
        else bucket.unknown += gross;
      });
    }

    // compute earned/outstanding
    totalsByArtist.forEach((totals, artistId) => {
      const term = termsByArtist.get(artistId) || { printPct: 0, originalPct: 0 };
      totals.earned = computeEarned(totals.print, totals.original, totals.unknown, term.printPct, term.originalPct);
    });

    const openPayoutArtistsCount = Array.from(totalsByArtist.values()).filter((t) => t.earned - t.paid > 0).length;
    const missingContractCount = artists.filter((a) => !contracts.some((c) => String(c.kunstlerId) === String(a._id))).length;
    const missingPayoutDetailsCount = artists.filter((a) => !payoutDetails.some((p) => String(p.kunstlerId) === String(a._id))).length;

    return NextResponse.json(
      {
        ordersTodayCount: ordersTodayShopify + ordersTodayPos,
        openPayoutArtistsCount,
        missingContractCount,
        missingPayoutDetailsCount,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to load admin metrics", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
