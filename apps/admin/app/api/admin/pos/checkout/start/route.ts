import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import { appendPosAuditLog } from "@/lib/pos/audit";
import { createArtworkContractDraft, type ArtworkContractInput } from "@/lib/pos/contracts";
import { tseCancel, tseStart } from "@/lib/pos/tse";
import { getTerminalPaymentProvider, mapProviderStatusToTransactionStatus, resolvePaymentProviderName } from "@/lib/pos/terminalPayments";
import { requireAdmin } from "@/lib/requireAdmin";
import { PosAgentModel } from "@/models/PosAgent";
import { PosItemModel } from "@/models/PosItem";
import { PosLocationModel } from "@/models/PosLocation";
import { PosTerminalModel } from "@/models/PosTerminal";
import { POSTransactionModel, posBuyerTypes } from "@/models/PosTransaction";

const cartLineSchema = z.object({
  itemId: z.string().trim().min(1, "itemId is required"),
  qty: z.coerce.number().int().min(1, "qty must be at least 1"),
});

const buyerSchema = z.object({
  type: z.enum(posBuyerTypes),
  name: z.string().trim().min(1, "buyer.name is required"),
  company: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  vatId: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
  shippingAddress: z.string().trim().optional(),
});

const startCheckoutSchema = z.object({
  locationId: z.string().trim().min(1, "locationId is required"),
  terminalId: z.string().trim().min(1, "terminalId is required"),
  paymentMethod: z.enum(["terminal_bridge", "terminal_external"]).optional(),
  cart: z.array(cartLineSchema).min(1, "cart must contain at least one line"),
  buyer: buyerSchema,
  contract: z
    .object({
      artworks: z
        .array(
          z.object({
            itemId: z.string().trim().min(1, "contract.artworks.itemId is required"),
            artistName: z.string().trim().optional(),
            title: z.string().trim().optional(),
            year: z.string().trim().optional(),
            techniqueSize: z.string().trim().optional(),
            editionType: z.enum(["unique", "edition"]).optional(),
          }),
        )
        .min(1, "contract.artworks must contain at least one line"),
      deliveryMethod: z.enum(["pickup", "shipping", "forwarding"]),
      estimatedDeliveryDate: z.string().trim().optional(),
      buyerSignatureDataUrl: z.string().trim().min(1, "contract buyer signature is required"),
    })
    .optional(),
});

type PosItemForCheckout = {
  _id: Types.ObjectId;
  type: "artwork" | "event";
  title: string;
  priceGrossCents: number;
  vatRate: 0 | 7 | 19;
  currency: "EUR";
  artistName?: string;
  isActive: boolean;
};

const BRIDGE_AGENT_MAX_AGE_MS = 30_000;

function ensureObjectId(value: string, field: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`invalid_${field}`);
  }
  return new Types.ObjectId(value);
}

function toOptionalTrimmed(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function computeNetCents(grossCents: number, vatRate: 0 | 7 | 19) {
  if (vatRate === 0) return grossCents;
  return Math.round((grossCents * 100) / (100 + vatRate));
}

function buildTotals(
  lines: Array<{
    qty: number;
    unitGrossCents: number;
    vatRate: 0 | 7 | 19;
  }>,
) {
  let grossCents = 0;
  let netCents = 0;
  let vatCents = 0;

  for (const line of lines) {
    const lineGross = line.qty * line.unitGrossCents;
    const lineNet = computeNetCents(lineGross, line.vatRate);
    grossCents += lineGross;
    netCents += lineNet;
    vatCents += lineGross - lineNet;
  }

  return { grossCents, netCents, vatCents };
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !Types.ObjectId.isValid(session.user.id)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = startCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0];
    return NextResponse.json({ ok: false, error: first?.message || "invalid_payload" }, { status: 400 });
  }

  let locationObjectId: Types.ObjectId;
  let terminalObjectId: Types.ObjectId;
  let createdTxId: Types.ObjectId | null = null;

  try {
    locationObjectId = ensureObjectId(parsed.data.locationId, "locationId");
    terminalObjectId = ensureObjectId(parsed.data.terminalId, "terminalId");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_payload";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    await connectMongo();

    const [location, terminal] = await Promise.all([
      PosLocationModel.findById(locationObjectId).lean(),
      PosTerminalModel.findById(terminalObjectId).lean(),
    ]);

    if (!location) {
      return NextResponse.json({ ok: false, error: "location_not_found" }, { status: 404 });
    }
    if (!terminal) {
      return NextResponse.json({ ok: false, error: "terminal_not_found" }, { status: 404 });
    }
    if (terminal.locationId.toString() !== location._id.toString()) {
      return NextResponse.json({ ok: false, error: "terminal_location_mismatch" }, { status: 400 });
    }
    if (terminal.isActive === false) {
      return NextResponse.json({ ok: false, error: "terminal_inactive" }, { status: 400 });
    }

    const mergedCartByItemId = new Map<string, number>();
    for (const line of parsed.data.cart) {
      mergedCartByItemId.set(line.itemId, (mergedCartByItemId.get(line.itemId) || 0) + line.qty);
    }

    const itemIds: Types.ObjectId[] = [];
    try {
      for (const itemId of mergedCartByItemId.keys()) {
        itemIds.push(ensureObjectId(itemId, "itemId"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_payload";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const posItems = (await PosItemModel.find({ _id: { $in: itemIds } }).lean()) as PosItemForCheckout[];
    const itemById = new Map(posItems.map((item) => [item._id.toString(), item]));

    const txItems: Array<{
      itemId: Types.ObjectId;
      qty: number;
      unitGrossCents: number;
      vatRate: 0 | 7 | 19;
      titleSnapshot: string;
    }> = [];
    const artworkLinesForContract: Array<{
      itemId: string;
      artistName?: string;
      title: string;
      qty: number;
      unitGrossCents: number;
    }> = [];

    for (const [itemId, qty] of mergedCartByItemId) {
      const item = itemById.get(itemId);
      if (!item) {
        return NextResponse.json({ ok: false, error: `item_not_found:${itemId}` }, { status: 400 });
      }
      if (!item.isActive) {
        return NextResponse.json({ ok: false, error: `item_inactive:${itemId}` }, { status: 400 });
      }
      txItems.push({
        itemId: item._id,
        qty,
        unitGrossCents: item.priceGrossCents,
        vatRate: item.vatRate,
        titleSnapshot: item.title,
      });
      if (item.type === "artwork") {
        artworkLinesForContract.push({
          itemId,
          artistName: item.artistName,
          title: item.title,
          qty,
          unitGrossCents: item.priceGrossCents,
        });
      }
    }

    if (artworkLinesForContract.length > 0 && !parsed.data.contract) {
      return NextResponse.json({ ok: false, error: "contract_required_for_artwork" }, { status: 400 });
    }

    const totals = buildTotals(txItems);
    const actorAdminId = new Types.ObjectId(session.user.id);
    const requestedPaymentMethod = parsed.data.paymentMethod || "terminal_bridge";
    const useExternal = requestedPaymentMethod === "terminal_external" || terminal.mode === "external";

    const defaultConnectedProvider = resolvePaymentProviderName("bridge");
    const paymentProviderName = useExternal
      ? "external"
      : defaultConnectedProvider === "external"
        ? "bridge"
        : defaultConnectedProvider;
    const paymentMethod = useExternal ? "terminal_external" : "terminal_bridge";

    let bridgeAgentId: string | null = null;
    if (paymentProviderName === "bridge") {
      const terminalHost = terminal.host?.trim();
      const terminalPort = typeof terminal.port === "number" ? terminal.port : 22000;
      if (!terminalHost) {
        return NextResponse.json({ ok: false, error: "terminal_host_missing" }, { status: 400 });
      }
      if (!terminalPort || terminalPort <= 0) {
        return NextResponse.json({ ok: false, error: "terminal_port_invalid" }, { status: 400 });
      }

      const onlineSince = new Date(Date.now() - BRIDGE_AGENT_MAX_AGE_MS);
      const preferredAgentId =
        terminal.agentId && Types.ObjectId.isValid(terminal.agentId.toString()) ? new Types.ObjectId(terminal.agentId) : null;

      const preferredAgent = preferredAgentId
        ? await PosAgentModel.findOne({
            _id: preferredAgentId,
            isActive: true,
            lastSeenAt: { $gte: onlineSince },
          }).lean()
        : null;

      const fallbackAgent = preferredAgent
        ? null
        : await PosAgentModel.findOne({
            isActive: true,
            lastSeenAt: { $gte: onlineSince },
          })
            .sort({ lastSeenAt: -1 })
            .lean();

      const selectedAgent = preferredAgent || fallbackAgent;
      if (!selectedAgent) {
        return NextResponse.json(
          {
            ok: false,
            error: "no_bridge_agent_online",
            fallback: "terminal_external",
          },
          { status: 409 },
        );
      }
      bridgeAgentId = selectedAgent._id.toString();
    }

    const tx = await POSTransactionModel.create({
      locationId: location._id,
      terminalId: terminal._id,
      status: "created",
      items: txItems,
      totals,
      buyer: {
        type: parsed.data.buyer.type,
        name: parsed.data.buyer.name.trim(),
        company: toOptionalTrimmed(parsed.data.buyer.company),
        email: toOptionalTrimmed(parsed.data.buyer.email),
        phone: toOptionalTrimmed(parsed.data.buyer.phone),
        vatId: toOptionalTrimmed(parsed.data.buyer.vatId),
        billingAddress: toOptionalTrimmed(parsed.data.buyer.billingAddress),
        shippingAddress: toOptionalTrimmed(parsed.data.buyer.shippingAddress),
      },
      payment: {
        provider: paymentProviderName,
        method: paymentMethod,
      },
      createdByAdminId: actorAdminId,
    });
    createdTxId = tx._id as Types.ObjectId;

    if (artworkLinesForContract.length > 0) {
      await createArtworkContractDraft({
        txId: tx._id,
        buyer: {
          name: parsed.data.buyer.name.trim(),
          company: toOptionalTrimmed(parsed.data.buyer.company),
          billingAddress: toOptionalTrimmed(parsed.data.buyer.billingAddress),
          shippingAddress: toOptionalTrimmed(parsed.data.buyer.shippingAddress),
          email: toOptionalTrimmed(parsed.data.buyer.email),
          phone: toOptionalTrimmed(parsed.data.buyer.phone),
        },
        artworkLines: artworkLinesForContract,
        contractInput: parsed.data.contract as ArtworkContractInput,
        grossCents: totals.grossCents,
        isPaid: false,
      });
    }

    await appendPosAuditLog({
      actorAdminId,
      action: "CREATE_TX",
      txId: tx._id,
      payload: {
        locationId: location._id.toString(),
        terminalId: terminal._id.toString(),
        itemCount: txItems.length,
        grossCents: totals.grossCents,
      },
    });

    await tseStart(tx, actorAdminId);

    const provider = getTerminalPaymentProvider(paymentProviderName);
    const payment = await provider.createPayment({
      amountCents: totals.grossCents,
      currency: "EUR",
      referenceId: tx._id.toString(),
      terminalRef: terminal.terminalRef,
      metadata: {
        txId: tx._id.toString(),
        locationId: location._id.toString(),
        terminalId: terminal._id.toString(),
        agentId: bridgeAgentId,
        terminalHost: terminal.host ?? null,
        terminalPort: terminal.port ?? 22000,
        zvtPassword: terminal.zvtPassword ?? null,
        paymentMethod,
      },
    });

    const mappedStatus = mapProviderStatusToTransactionStatus(payment.status);
    const status =
      mappedStatus === "failed" || mappedStatus === "cancelled" ? mappedStatus : ("payment_pending" as const);
    const setPayload: Record<string, unknown> = {
      status,
      "payment.providerTxId": payment.providerTxId,
      "payment.rawStatusPayload": {
        createPayment: payment.raw ?? null,
      },
    };

    await POSTransactionModel.updateOne({ _id: tx._id }, { $set: setPayload });

    if (mappedStatus === "failed" || mappedStatus === "cancelled") {
      await tseCancel(tx, actorAdminId, `payment_${mappedStatus}`);
    }

    return NextResponse.json(
      {
        ok: true,
        txId: tx._id.toString(),
        providerTxId: payment.providerTxId,
        provider: paymentProviderName,
        status,
      },
      { status: 200 },
    );
  } catch (error) {
    if (createdTxId) {
      try {
        await POSTransactionModel.updateOne({ _id: createdTxId }, { $set: { status: "failed" } });
        await tseCancel({ _id: createdTxId }, session.user.id, "checkout_start_failed");
      } catch {
        // best-effort failure marking
      }
    }
    console.error("Failed to start POS checkout", error);
    const message = error instanceof Error ? error.message : "checkout_start_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
