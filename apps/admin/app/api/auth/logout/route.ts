import { NextResponse } from "next/server";

import {
  clearCustomerSessionCookie,
  deleteCustomerSession,
  getCustomerSessionToken,
} from "@/lib/customerSessions";

export async function POST(req: Request) {
  try {
    const token = getCustomerSessionToken(req);
    if (token) {
      await deleteCustomerSession(token);
    }

    const res = NextResponse.json({ ok: true });
    clearCustomerSessionCookie(res);
    return res;
  } catch (err) {
    console.error("Failed to logout customer", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
