import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongodb";
import { ArtistModel } from "@/models/Artist";
import { ContractTermsModel } from "@/models/ContractTerms";
import { PayoutTransactionModel } from "@/models/PayoutTransaction";
import { loadArtistOrderSales } from "@/lib/artistOrderSales";
import { createSyncRunId, logShopifyDiagnostics } from "@/lib/sync/syncLogger";

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
    const runId = createSyncRunId("admin-artist-orders-summary");
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

    const sales = await loadArtistOrderSales({ adminArtistId: id, includeUnpaid, includeCancelled });
    const orderEntries = sales.orders;

    logShopifyDiagnostics(
      "admin_artist_orders_summary_loaded",
      {
        adminArtistOrdersCanonicalArtistId: sales.identity.canonicalArtistId,
        orderCountAdminLogic: orderEntries.length,
        adminArtistId: id,
        artistMetaobjectId: metaobjectId || null,
      },
      { runId, force: true },
    );

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
        debug: {
          adminArtistOrdersCanonicalArtistId: sales.identity.canonicalArtistId,
          orderCountAdminLogic: orderEntries.length,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Failed to fetch artist orders summary", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
