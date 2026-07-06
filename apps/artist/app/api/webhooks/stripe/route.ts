import { verifyStripeSignature } from "@/lib/server/stripe";
import { connectMongo } from "@/lib/server/mongodb";
import { DonationModel, NetworkProfileModel } from "@/lib/server/models";
export async function POST(req: Request) {
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"))) return Response.json({ error: "invalid_signature" }, { status: 400 });
  let event: any; try { event = JSON.parse(payload); } catch { return Response.json({ error: "invalid_payload" }, { status: 400 }); }
  await connectMongo(); const object = event.data?.object || {}; const donationId = object.metadata?.donationId;
  if (event.type === "checkout.session.completed" && donationId) await DonationModel.updateOne({ _id: donationId, status: { $in: ["pending", "failed"] } }, { $set: { status: object.payment_status === "paid" ? "paid" : "pending", stripePaymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : undefined, paidAt: object.payment_status === "paid" ? new Date() : undefined } });
  else if (event.type === "payment_intent.succeeded" && donationId) await DonationModel.updateOne({ _id: donationId }, { $set: { status: "paid", stripePaymentIntentId: object.id, paidAt: new Date() } });
  else if (event.type === "payment_intent.payment_failed" && donationId) await DonationModel.updateOne({ _id: donationId, status: { $ne: "paid" } }, { $set: { status: "failed", stripePaymentIntentId: object.id } });
  else if (event.type === "charge.refunded" && object.payment_intent) await DonationModel.updateOne({ stripePaymentIntentId: object.payment_intent }, { $set: { status: object.amount_refunded >= object.amount ? "refunded" : "partially_refunded", refundedAt: new Date() } });
  else if (event.type === "account.updated" && object.id) { const ready = object.charges_enabled === true && object.payouts_enabled === true; await NetworkProfileModel.updateOne({ stripeAccountId: object.id }, { $set: { stripeOnboardingComplete: ready, donationEnabled: ready } }); }
  return Response.json({ received: true });
}
