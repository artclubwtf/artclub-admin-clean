import { VerifoneProvider } from "@/lib/pos/payments/providers/verifoneProvider";
import { connectMongo } from "@/lib/mongodb";
import { PosCommandModel } from "@/models/PosCommand";
import { POSTransactionModel } from "@/models/PosTransaction";

export type TerminalPaymentStatus = "payment_pending" | "paid" | "failed" | "cancelled" | "refunded";
export type PaymentProviderName = "mock" | "verifone" | "bridge" | "external";

export type CreateTerminalPaymentInput = {
  amountCents: number;
  currency: string;
  referenceId: string;
  terminalRef: string;
  metadata?: Record<string, unknown>;
};

export type TerminalPaymentProvider = {
  createPayment(input: CreateTerminalPaymentInput): Promise<{ providerTxId: string; status: TerminalPaymentStatus; raw?: unknown }>;
  getPaymentStatus(providerTxId: string): Promise<{ status: TerminalPaymentStatus; raw?: unknown }>;
  cancelPayment(providerTxId: string): Promise<void>;
  refundPayment(providerTxId: string, amountCents?: number): Promise<void>;
};

const MOCK_PAYMENT_DELAY_MS = 2_000;
const mockStateByTxId = new Map<string, { status: TerminalPaymentStatus; createdAt: number }>();

function parseMockCreatedAt(providerTxId: string): number {
  const [, rawTs] = providerTxId.split("_");
  const parsed = Number(rawTs);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export class MockProvider implements TerminalPaymentProvider {
  async createPayment(input: CreateTerminalPaymentInput) {
    void input;
    const createdAt = Date.now();
    const providerTxId = `mock_${createdAt}_${Math.random().toString(36).slice(2, 10)}`;
    mockStateByTxId.set(providerTxId, { status: "payment_pending", createdAt });
    return { providerTxId, status: "payment_pending" as const, raw: { provider: "mock", createdAt } };
  }

  async getPaymentStatus(providerTxId: string) {
    const existing = mockStateByTxId.get(providerTxId);
    const createdAt = existing?.createdAt ?? parseMockCreatedAt(providerTxId);
    const currentStatus = existing?.status ?? "payment_pending";

    if (currentStatus === "cancelled" || currentStatus === "failed" || currentStatus === "refunded") {
      return { status: currentStatus, raw: { provider: "mock", providerTxId, status: currentStatus } };
    }

    const status: TerminalPaymentStatus = Date.now() - createdAt >= MOCK_PAYMENT_DELAY_MS ? "paid" : "payment_pending";
    mockStateByTxId.set(providerTxId, { status, createdAt });
    return { status, raw: { provider: "mock", providerTxId, status, createdAt } };
  }

  async cancelPayment(providerTxId: string) {
    const existing = mockStateByTxId.get(providerTxId);
    mockStateByTxId.set(providerTxId, { status: "cancelled", createdAt: existing?.createdAt ?? Date.now() });
  }

  async refundPayment(providerTxId: string, amountCents?: number) {
    void amountCents;
    const existing = mockStateByTxId.get(providerTxId);
    mockStateByTxId.set(providerTxId, { status: "refunded", createdAt: existing?.createdAt ?? Date.now() });
  }
}

const mockProvider = new MockProvider();
const verifoneProvider = new VerifoneProvider();
const BRIDGE_REFUND_UNSUPPORTED_ERROR = "Refund only supported for provider X";
const EXTERNAL_REFUND_UNSUPPORTED_ERROR = "Refund only supported for provider X";

function normalizeProviderName(providerName?: string | null): PaymentProviderName {
  const normalized = providerName?.trim().toLowerCase();
  if (normalized === "verifone") return "verifone";
  if (normalized === "bridge") return "bridge";
  if (normalized === "external") return "external";
  return "mock";
}

export function resolvePaymentProviderName(fallbackProviderName?: string | null): PaymentProviderName {
  const fromEnv = process.env.POS_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (fromEnv === "verifone" || fromEnv === "mock" || fromEnv === "bridge" || fromEnv === "external") {
    return fromEnv as PaymentProviderName;
  }

  if (process.env.NODE_ENV !== "production") {
    return "mock";
  }

  if (fallbackProviderName) {
    const fallback = normalizeProviderName(fallbackProviderName);
    if (fallback === "bridge" || fallback === "external") {
      return fallback;
    }
  }

  return "bridge";
}

function mapTransactionStatusToProviderStatus(status?: string | null): TerminalPaymentStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "cancelled":
    case "storno":
      return "cancelled";
    case "refunded":
      return "refunded";
    default:
      return "payment_pending";
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

class BridgeProvider implements TerminalPaymentProvider {
  async createPayment(input: CreateTerminalPaymentInput) {
    await connectMongo();
    const metadata = asObject(input.metadata);
    const agentId = typeof metadata.agentId === "string" ? metadata.agentId : null;
    if (!agentId) {
      throw new Error("bridge_agent_required");
    }

    const txId = typeof metadata.txId === "string" ? metadata.txId : input.referenceId;
    const terminalHost = typeof metadata.terminalHost === "string" ? metadata.terminalHost : null;
    const terminalPort = typeof metadata.terminalPort === "number" ? metadata.terminalPort : 22000;
    const zvtPassword = typeof metadata.zvtPassword === "string" ? metadata.zvtPassword : null;
    if (!terminalHost) {
      throw new Error("bridge_terminal_host_required");
    }

    const command = await PosCommandModel.create({
      agentId,
      type: "zvt_payment",
      status: "queued",
      payload: {
        txId,
        amountCents: input.amountCents,
        currency: input.currency,
        terminalRef: input.terminalRef,
        terminalHost,
        terminalPort,
        zvtPassword,
        metadata,
      },
    });

    return {
      providerTxId: command._id.toString(),
      status: "payment_pending" as const,
      raw: {
        mode: "bridge",
        commandId: command._id.toString(),
        agentId,
      },
    };
  }

  async getPaymentStatus(providerTxId: string) {
    await connectMongo();
    const command = await PosCommandModel.findById(providerTxId).lean();
    const payload = asObject(command?.payload);
    const txId = typeof payload.txId === "string" ? payload.txId : null;

    const tx =
      txId && txId.trim().length > 0
        ? await POSTransactionModel.findById(txId).select({ status: 1, payment: 1 }).lean()
        : await POSTransactionModel.findOne({ "payment.providerTxId": providerTxId })
            .select({ status: 1, payment: 1 })
            .lean();

    const status = mapTransactionStatusToProviderStatus(tx?.status);
    return {
      status,
      raw: {
        mode: "bridge",
        commandId: providerTxId,
        commandStatus: command?.status ?? null,
        txStatus: tx?.status ?? null,
      },
    };
  }

  async cancelPayment(providerTxId: string) {
    await connectMongo();
    const command = await PosCommandModel.findById(providerTxId).lean();
    const payload = asObject(command?.payload);
    const txId = typeof payload.txId === "string" ? payload.txId : null;
    const agentId = command?.agentId;
    if (!agentId) return;

    await PosCommandModel.create({
      agentId,
      type: "zvt_abort",
      status: "queued",
      payload: {
        txId,
        relatedCommandId: providerTxId,
      },
    });
  }

  async refundPayment(_providerTxId: string, _amountCents?: number) {
    void _providerTxId;
    void _amountCents;
    throw new Error(BRIDGE_REFUND_UNSUPPORTED_ERROR);
  }
}

class ExternalProvider implements TerminalPaymentProvider {
  async createPayment(input: CreateTerminalPaymentInput) {
    return {
      providerTxId: `external:${input.referenceId}`,
      status: "payment_pending" as const,
      raw: {
        mode: "external",
      },
    };
  }

  async getPaymentStatus(providerTxId: string) {
    await connectMongo();
    const txId = providerTxId.startsWith("external:") ? providerTxId.slice("external:".length) : providerTxId;
    const tx = await POSTransactionModel.findById(txId).select({ status: 1 }).lean();
    return {
      status: mapTransactionStatusToProviderStatus(tx?.status),
      raw: {
        mode: "external",
        txStatus: tx?.status ?? null,
      },
    };
  }

  async cancelPayment(providerTxId: string) {
    await connectMongo();
    const txId = providerTxId.startsWith("external:") ? providerTxId.slice("external:".length) : providerTxId;
    await POSTransactionModel.updateOne(
      { _id: txId, status: { $in: ["created", "payment_pending"] } },
      { $set: { status: "cancelled" } },
    );
  }

  async refundPayment(_providerTxId: string, _amountCents?: number) {
    void _providerTxId;
    void _amountCents;
    throw new Error(EXTERNAL_REFUND_UNSUPPORTED_ERROR);
  }
}

const bridgeProvider = new BridgeProvider();
const externalProvider = new ExternalProvider();

export function getTerminalPaymentProvider(providerName?: string | null): TerminalPaymentProvider {
  const resolved = providerName ? normalizeProviderName(providerName) : resolvePaymentProviderName();
  if (resolved === "bridge") return bridgeProvider;
  if (resolved === "external") return externalProvider;
  if (resolved === "verifone") return verifoneProvider;
  return mockProvider;
}

export function mapProviderStatusToTransactionStatus(status: TerminalPaymentStatus) {
  switch (status) {
    case "paid":
      return "paid" as const;
    case "failed":
      return "failed" as const;
    case "cancelled":
      return "cancelled" as const;
    case "refunded":
      return "refunded" as const;
    default:
      return "payment_pending" as const;
  }
}
