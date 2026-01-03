import { NextResponse } from "next/server";

import { getCustomerUserBySessionToken } from "@/lib/customerAuth";
import { clearCustomerSessionCookie, getCustomerSessionToken } from "@/lib/customerSessions";

export async function GET(req: Request) {
  try {
    const token = getCustomerSessionToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getCustomerUserBySessionToken(token);
    if (!user) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      clearCustomerSessionCookie(res);
      return res;
    }

    return NextResponse.json({ user });
  } catch (err) {
    console.error("Failed to load customer session", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
