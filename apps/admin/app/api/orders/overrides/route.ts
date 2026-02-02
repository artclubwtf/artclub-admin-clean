import { NextResponse } from "next/server";
import { z } from "zod";
import { connectMongo } from "@/lib/mongodb";
import { OrderLineOverrideModel, orderLineOverrideSaleTypes, orderLineOverrideSources } from "@/models/OrderLineOverride";

const bodySchema = z.object({
  orderSource: z.enum(orderLineOverrideSources),
  orderId: z.string().min(1, "orderId is required"),
  lineKey: z.string().min(1, "lineKey is required"),
  overrideArtistMetaobjectGid: z.string().optional(),
  overrideSaleType: z.enum(orderLineOverrideSaleTypes).optional(),
  overrideGross: z.coerce.number().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ error: first?.message || "Invalid payload" }, { status: 400 });
    }

    const { orderSource, orderId, lineKey, overrideArtistMetaobjectGid, overrideSaleType, overrideGross } = parsed.data;

    await connectMongo();

    const update: Record<string, any> = {
      orderSource,
      lineKey,
      overrideArtistMetaobjectGid,
      overrideSaleType,
      overrideGross,
    };

    if (orderSource === "shopify") {
      update.shopifyOrderGid = orderId;
    } else {
      update.posOrderId = orderId;
    }

    const override = await OrderLineOverrideModel.findOneAndUpdate(
      { orderSource, lineKey, ...(orderSource === "shopify" ? { shopifyOrderGid: orderId } : { posOrderId: orderId }) },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({ override }, { status: 200 });
  } catch (err) {
    console.error("Failed to upsert order override", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
