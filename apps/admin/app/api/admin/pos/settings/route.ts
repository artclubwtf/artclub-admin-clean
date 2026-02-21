import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    {
      ok: true,
      settings: {
        terminals: [],
        locations: [],
        tax: {
          defaultRate: null,
        },
        invoiceThresholds: {
          receiptOnlyMax: null,
          invoiceRequiredFrom: null,
        },
      },
    },
    { status: 200 },
  );
}
