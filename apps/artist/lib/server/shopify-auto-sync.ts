import { pushOneArtist, pushOneProduct } from "../../../admin/lib/sync/shopifyPush";
import { CanonicalArtistModel, CanonicalProductModel } from "@/lib/server/models";

export type AutoShopifySyncResult =
  | { ok: true; skipped?: boolean; message?: string }
  | { ok: false; error: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "shopify_sync_failed";
}

function resultFromPushItem(
  result: Awaited<ReturnType<typeof pushOneProduct>> | Awaited<ReturnType<typeof pushOneArtist>>,
  key: string,
): AutoShopifySyncResult {
  const item = result.items.find((entry) => entry.key === key) || result.items[0];
  if (item?.status === "created" || item?.status === "updated") {
    return { ok: true, message: item.message };
  }
  if (item?.status === "skipped" || item?.status === "dry_run") {
    return { ok: false, error: item.message };
  }
  return { ok: false, error: item?.message || result.errors[0] || "shopify_sync_failed" };
}

export async function autoPushProductToShopify(input: {
  shopDomain: string;
  productKey: string;
  shouldPush: boolean;
}): Promise<AutoShopifySyncResult> {
  if (!input.shouldPush) return { ok: true, skipped: true, message: "not_saleable" };

  try {
    const result = await pushOneProduct({ shopDomain: input.shopDomain, productKey: input.productKey });
    const sync = resultFromPushItem(result, input.productKey);
    if (!sync.ok) {
      await CanonicalProductModel.updateOne(
        { shopDomain: input.shopDomain, productKey: input.productKey },
        {
          $set: {
            "sync.needsPush": true,
            "sync.lastError": sync.error,
          },
        },
      ).catch(() => null);
    }
    return sync;
  } catch (error) {
    const message = errorMessage(error);
    await CanonicalProductModel.updateOne(
      { shopDomain: input.shopDomain, productKey: input.productKey },
      {
        $set: {
          "sync.needsPush": true,
          "sync.lastError": message,
        },
      },
    ).catch(() => null);
    return { ok: false, error: message };
  }
}

export async function autoPushArtistToShopify(input: {
  shopDomain: string;
  artistKey: string;
  shouldPush: boolean;
}): Promise<AutoShopifySyncResult> {
  if (!input.shouldPush) return { ok: true, skipped: true, message: "no_public_profile_changes" };

  try {
    const result = await pushOneArtist({ shopDomain: input.shopDomain, artistKey: input.artistKey });
    const sync = resultFromPushItem(result, input.artistKey);
    if (!sync.ok) {
      await CanonicalArtistModel.updateOne(
        { shopDomain: input.shopDomain, artistKey: input.artistKey },
        {
          $set: {
            "sync.needsPush": true,
            "sync.lastError": sync.error,
          },
        },
      ).catch(() => null);
    }
    return sync;
  } catch (error) {
    const message = errorMessage(error);
    await CanonicalArtistModel.updateOne(
      { shopDomain: input.shopDomain, artistKey: input.artistKey },
      {
        $set: {
          "sync.needsPush": true,
          "sync.lastError": message,
        },
      },
    ).catch(() => null);
    return { ok: false, error: message };
  }
}
