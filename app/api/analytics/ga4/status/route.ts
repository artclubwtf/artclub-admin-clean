import { NextResponse } from "next/server";
import { getGa4Client, getGa4Config } from "@/lib/ga4";

export async function GET() {
  try {
    const config = getGa4Config();
    if (!config.ok || !config.propertyId) {
      return NextResponse.json({
        ok: true,
        configured: false,
        required: ["GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_JSON_BASE64"],
      });
    }

    const client = await getGa4Client();
    if (!client) {
      return NextResponse.json({
        ok: true,
        configured: false,
        required: ["GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_JSON_BASE64"],
      });
    }

    const pid = config.propertyId;
    const masked = pid.length > 4 ? `${"*".repeat(Math.max(0, pid.length - 4))}${pid.slice(-4)}` : pid;

    return NextResponse.json({
      ok: true,
      configured: true,
      propertyId: masked,
      cacheTtlMinutes: 10,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      configured: false,
      required: ["GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_JSON_BASE64"],
    });
  }
}
