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
      ],
    },
    { status: 200 },
  );
}
