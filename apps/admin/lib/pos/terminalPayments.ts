export type TerminalPaymentStatus = "payment_pending" | "paid" | "failed" | "cancelled" | "refunded";

export type CreateTerminalPaymentInput = {
  amountCents: number;
  currency: string;
  referenceId: string;
  terminalRef: string;
  metadata?: Record<string, unknown>;
};

export type TerminalPaymentProvider = {
  createPayment(input: CreateTerminalPaymentInput): Promise<{ providerTxId: string; status: TerminalPaymentStatus }>;
  getPaymentStatus(providerTxId: string): Promise<{ status: TerminalPaymentStatus }>;
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
    return { providerTxId, status: "payment_pending" as const };
  }

  async getPaymentStatus(providerTxId: string) {
    const existing = mockStateByTxId.get(providerTxId);
    const createdAt = existing?.createdAt ?? parseMockCreatedAt(providerTxId);
    const currentStatus = existing?.status ?? "payment_pending";

    if (currentStatus === "cancelled" || currentStatus === "failed" || currentStatus === "refunded") {
      return { status: currentStatus };
    }

    const status: TerminalPaymentStatus = Date.now() - createdAt >= MOCK_PAYMENT_DELAY_MS ? "paid" : "payment_pending";
    mockStateByTxId.set(providerTxId, { status, createdAt });
    return { status };
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

export function getTerminalPaymentProvider(providerName?: string | null): TerminalPaymentProvider {
  const normalized = providerName?.trim().toLowerCase();
  if (!normalized || normalized === "mock") return mockProvider;
  if (process.env.NODE_ENV !== "production") return mockProvider;

  // Fallback until real semi-integrated terminal providers are connected.
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
