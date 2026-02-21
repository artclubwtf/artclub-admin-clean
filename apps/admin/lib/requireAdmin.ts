import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";

export async function requireAdmin(_req: Request) {
  void _req;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "team") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return null;
}
