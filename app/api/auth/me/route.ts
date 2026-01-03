import { NextResponse } from "next/server";

import {
  clearCustomerSessionCookie,
  getCustomerSession,
  getCustomerSessionToken,
} from "@/lib/customerSessions";
import { connectMongo } from "@/lib/mongodb";
import { UserModel } from "@/models/User";

export async function GET(req: Request) {
  try {
    const token = getCustomerSessionToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await getCustomerSession(token);
    if (!session) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      clearCustomerSessionCookie(res);
      return res;
    }

    await connectMongo();
    const user = await UserModel.findById(session.userId).lean();
    if (!user || !user.isActive || user.role !== "customer") {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      clearCustomerSessionCookie(res);
      return res;
    }

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name,
        shopDomain: user.shopDomain,
        shopifyCustomerGid: user.shopifyCustomerGid ?? null,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Failed to load customer session", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
