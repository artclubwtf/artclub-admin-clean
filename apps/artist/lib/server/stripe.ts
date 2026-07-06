import { createHmac, timingSafeEqual } from "node:crypto";

export function stripeConfigured() { return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET); }
export async function stripeRequest(path: string, body: URLSearchParams) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe_setup_required");
  const response = await fetch(`https://api.stripe.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(json?.error?.message || "stripe_request_failed");
  return json;
}
export function verifyStripeSignature(payload: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; if (!secret || !signature) return false;
  const parts = signature.split(",").map((part) => part.split("=")); const timestamp = parts.find(([key]) => key === "t")?.[1]; const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((value) => { try { const a = Buffer.from(value, "hex"); const b = Buffer.from(expected, "hex"); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; } });
}
