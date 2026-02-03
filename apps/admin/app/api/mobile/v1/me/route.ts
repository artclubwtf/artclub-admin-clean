import { NextResponse } from "next/server";

import { getMobileUserFromRequest } from "@/lib/mobileAuth";

export async function GET(req: Request) {
  try {
    const user = await getMobileUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, user }, { status: 200 });
  } catch (err) {
    console.error("Failed to load mobile user", err);
    const message = err instanceof Error ? err.message : "Failed to load user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
