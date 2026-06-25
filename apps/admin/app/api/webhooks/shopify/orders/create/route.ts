import { handleShopifyOrderWebhook } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleShopifyOrderWebhook(req, "orders/create");
}
