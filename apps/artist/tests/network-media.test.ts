import { describe, expect, it } from "vitest";

import { buildNetworkMediaUrl, hydrateNetworkMediaKeys, isSafeNetworkStorageKey, normalizePersistedNetworkMediaUrl, resolveNetworkMediaForRead, tryExtractNetworkStorageKey } from "../lib/server/network-media";
import { networkMediaSchema, networkProfileInputSchema } from "@artclub/models";
import { networkNavItems, primaryNavigation } from "../lib/navigation";

describe("persistent network media",()=>{
  const key="network/507f1f77bcf86cd799439011/avatar/asset.webp";
  const stable=`https://network.artclub.test/api/network/media/${key}`;
  it("extracts and hydrates durable storage keys",()=>{expect(tryExtractNetworkStorageKey(stable)).toBe(key);expect(hydrateNetworkMediaKeys({profileImageUrl:stable})).toMatchObject({profileImageStorageKey:key})});
  it("rejects unsafe object paths",()=>{expect(isSafeNetworkStorageKey(key)).toBe(true);expect(isSafeNetworkStorageKey("network/../secret")).toBe(false);expect(isSafeNetworkStorageKey("artist/secret")).toBe(false)});
  it("accepts stable app media URLs and metadata",()=>{expect(networkMediaSchema.safeParse({url:`/api/network/media/${key}`,type:"video",storageKey:key,provider:"s3",width:1920,height:1080,duration:12}).success).toBe(true);expect(networkProfileInputSchema.safeParse({profileType:"artist",displayName:"A",username:"artist-a",profileImageUrl:`/api/network/media/${key}`}).success).toBe(true)});
  it("rewrites old signed object URLs on read",()=>{const previous=process.env.S3_PUBLIC_BASE_URL;delete process.env.S3_PUBLIC_BASE_URL;expect(resolveNetworkMediaForRead(`https://bucket.s3.eu-central-1.amazonaws.com/${key}?X-Amz-Signature=old`)).toBe(`/api/network/media/${key}`);if(previous)process.env.S3_PUBLIC_BASE_URL=previous});
  it("never persists the request host for private media",()=>{const previous=process.env.S3_PUBLIC_BASE_URL;delete process.env.S3_PUBLIC_BASE_URL;expect(buildNetworkMediaUrl("https://localhost:8080/api/network/upload",key)).toBe(`/api/network/media/${key}`);if(previous)process.env.S3_PUBLIC_BASE_URL=previous});
  it("uses the configured public storage origin when available",()=>{const previous=process.env.S3_PUBLIC_BASE_URL;process.env.S3_PUBLIC_BASE_URL="https://media.artclub.test/";expect(buildNetworkMediaUrl("https://localhost:8080/api/network/upload",key)).toBe(`https://media.artclub.test/${key}`);if(previous)process.env.S3_PUBLIC_BASE_URL=previous;else delete process.env.S3_PUBLIC_BASE_URL});
  it("normalizes legacy localhost URLs but preserves external media",()=>{expect(normalizePersistedNetworkMediaUrl(`https://localhost:8080/api/network/media/${key}`)).toBe(`/api/network/media/${key}`);expect(normalizePersistedNetworkMediaUrl("https://cdn.shopify.com/s/files/1/art.jpg")).toBe("https://cdn.shopify.com/s/files/1/art.jpg")});
});

describe("network navigation",()=>{
  it("uses one canonical destination set",()=>{expect(primaryNavigation.map(item=>item.href)).toEqual(["/feed","/explore-art","/events","/messages","/profile"]);expect(networkNavItems.map(item=>item.href)).toEqual(["/feed","/explore-art","/events","/profile"])});
});
