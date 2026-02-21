import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    {
      ok: true,
      sections: [
        { key: "settings", path: "/api/admin/pos/settings" },
        { key: "transactions", path: "/api/admin/pos/transactions" },
        { key: "catalog", path: "/api/admin/pos/catalog" },
        { key: "checkoutStart", path: "/api/admin/pos/checkout/start" },
        { key: "checkoutStatus", path: "/api/admin/pos/checkout/status" },
      ],
    },
    { status: 200 },
  );
}
