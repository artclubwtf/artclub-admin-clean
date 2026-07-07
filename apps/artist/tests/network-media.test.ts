import { describe, expect, it } from "vitest";

import { hydrateNetworkMediaKeys, isSafeNetworkStorageKey, resolveNetworkMediaForRead, tryExtractNetworkStorageKey } from "../lib/server/network-media";
import { networkMediaSchema, networkProfileInputSchema } from "@artclub/models";
import { networkNavItems, primaryNavigation } from "../lib/navigation";

describe("persistent network media",()=>{
  const key="network/507f1f77bcf86cd799439011/avatar/asset.webp";
  const stable=`https://network.artclub.test/api/network/media/${key}`;
  it("extracts and hydrates durable storage keys",()=>{expect(tryExtractNetworkStorageKey(stable)).toBe(key);expect(hydrateNetworkMediaKeys({profileImageUrl:stable})).toMatchObject({profileImageStorageKey:key})});
  it("rejects unsafe object paths",()=>{expect(isSafeNetworkStorageKey(key)).toBe(true);expect(isSafeNetworkStorageKey("network/../secret")).toBe(false);expect(isSafeNetworkStorageKey("artist/secret")).toBe(false)});
  it("accepts stable app media URLs and metadata",()=>{expect(networkMediaSchema.safeParse({url:`/api/network/media/${key}`,type:"video",storageKey:key,provider:"s3",width:1920,height:1080,duration:12}).success).toBe(true);expect(networkProfileInputSchema.safeParse({profileType:"artist",displayName:"A",username:"artist-a",profileImageUrl:`/api/network/media/${key}`}).success).toBe(true)});
  it("rewrites old signed object URLs on read",()=>{const previous=process.env.S3_PUBLIC_BASE_URL;delete process.env.S3_PUBLIC_BASE_URL;expect(resolveNetworkMediaForRead(`https://bucket.s3.eu-central-1.amazonaws.com/${key}?X-Amz-Signature=old`)).toBe(`/api/network/media/${key}`);if(previous)process.env.S3_PUBLIC_BASE_URL=previous});
});

describe("network navigation",()=>{
  it("uses one canonical destination set",()=>{expect(primaryNavigation.map(item=>item.href)).toEqual(["/feed","/explore-art","/events","/messages","/profile"]);expect(networkNavItems.map(item=>item.href)).toEqual(["/feed","/explore-art","/events","/profile"])});
});
