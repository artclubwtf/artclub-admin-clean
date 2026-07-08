import { describe, expect, it, vi } from "vitest";

import { resolveRenderableArtistProfileImages } from "../lib/server/public-artist-profile";
import { isShopifyCdnImageUrl, isShopifyMediaImageGid, resolveShopifyMediaImageGids } from "../lib/server/shopify-media";

describe("Shopify MediaImage resolution", () => {
  it("strictly validates MediaImage GIDs and direct CDN URLs", () => {
    expect(isShopifyMediaImageGid("gid://shopify/MediaImage/123")).toBe(true);
    expect(isShopifyMediaImageGid("gid://shopify/Product/123")).toBe(false);
    expect(isShopifyMediaImageGid("gid://shopify/MediaImage/not-a-number")).toBe(false);
    expect(isShopifyCdnImageUrl("https://cdn.shopify.com/s/files/1/image.jpg")).toBe(true);
    expect(isShopifyCdnImageUrl("http://cdn.shopify.com/s/files/1/image.jpg")).toBe(false);
  });

  it("deduplicates GIDs and resolves them in one GraphQL request", async () => {
    const first = "gid://shopify/MediaImage/91001";
    const second = "gid://shopify/MediaImage/91002";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.variables.ids).toEqual([first, second]);
      return new Response(JSON.stringify({ data: { nodes: [
        { id: first, image: { url: "https://cdn.shopify.com/s/files/1/first.jpg", width: 1200, height: 1500 } },
        { id: second, image: { url: "https://cdn.shopify.com/s/files/1/second.jpg" } },
      ] } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await resolveShopifyMediaImageGids([first, first, second], { fetchImpl, shopDomain: "example.myshopify.com", token: "test-token" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.unresolved).toEqual([]);
    expect(result.lookup[first]).toMatchObject({ url: "https://cdn.shopify.com/s/files/1/first.jpg", width: 1200, height: 1500 });
  });

  it("resolves one GID and ignores invalid GIDs", async () => {
    const gid = "gid://shopify/MediaImage/91501";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { nodes: [{ id: gid, image: { url: "https://cdn.shopify.com/s/files/1/single.jpg" } }] } }), { status: 200 })) as typeof fetch;
    const result = await resolveShopifyMediaImageGids([gid, "gid://shopify/Product/1", "invalid"], { fetchImpl, shopDomain: "example.myshopify.com", token: "test-token" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.lookup[gid]?.url).toBe("https://cdn.shopify.com/s/files/1/single.jpg");
    expect(result.unresolved).toEqual([]);
  });

  it("returns structured failures without throwing", async () => {
    const gid = "gid://shopify/MediaImage/92001";
    const apiFailure = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "failure" }] }), { status: 502 })) as typeof fetch;
    await expect(resolveShopifyMediaImageGids([gid], { fetchImpl: apiFailure, shopDomain: "example.myshopify.com", token: "test-token" })).resolves.toMatchObject({ unresolved: [gid], error: "shopify_media_request_failed_502" });
    const unavailable = vi.fn(async () => { throw new Error("offline"); }) as typeof fetch;
    await expect(resolveShopifyMediaImageGids(["gid://shopify/MediaImage/92002"], { fetchImpl: unavailable, shopDomain: "example.myshopify.com", token: "test-token" })).resolves.toMatchObject({ unresolved: ["gid://shopify/MediaImage/92002"], error: "shopify_media_request_unavailable" });
  });

  it("uses persisted media URLs before requesting Shopify", async () => {
    const gid = "gid://shopify/MediaImage/93001";
    const resolveGids = vi.fn();
    const result = await resolveRenderableArtistProfileImages({ avatarUrl: gid, media: [{ fieldKey: "bild_1", mediaGid: gid, url: "https://cdn.shopify.com/s/files/1/cached.jpg" }] }, { resolveGids });
    expect(resolveGids).not.toHaveBeenCalled();
    expect(result.profileImages.avatarUrl).toBe("https://cdn.shopify.com/s/files/1/cached.jpg");
    expect(result.unresolvedGids).toEqual([]);
  });

  it("keeps cached profile media when another GID cannot be resolved", async () => {
    const cachedGid = "gid://shopify/MediaImage/94001";
    const missingGid = "gid://shopify/MediaImage/94002";
    const result = await resolveRenderableArtistProfileImages({ avatarUrl: cachedGid, heroUrl: missingGid, media: [{ fieldKey: "bild_1", mediaGid: cachedGid, url: "https://cdn.shopify.com/s/files/1/cached-avatar.jpg" }] }, { resolveGids: async () => ({ lookup: {}, unresolved: [missingGid], error: "shopify_media_request_unavailable" }) });
    expect(result.profileImages.avatarUrl).toBe("https://cdn.shopify.com/s/files/1/cached-avatar.jpg");
    expect(result.profileImages.heroUrl).toBe("");
    expect(result.resolutionError).toBe("shopify_media_request_unavailable");
  });
});
