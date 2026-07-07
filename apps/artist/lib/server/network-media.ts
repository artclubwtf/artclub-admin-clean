import { getPublicS3Url, tryExtractS3KeyFromUrl } from "./s3";

export function isSafeNetworkStorageKey(key: string) {
  return key.startsWith("network/") && !key.includes("..") && !key.includes("\\") && key.length <= 1024;
}

export function buildNetworkMediaUrl(requestUrl: string, storageKey: string) {
  if (!isSafeNetworkStorageKey(storageKey)) throw new Error("invalid_storage_key");
  const publicUrl = getPublicS3Url(storageKey);
  if (publicUrl) return publicUrl;
  const encodedPath = storageKey.split("/").map(encodeURIComponent).join("/");
  return new URL(`/api/network/media/${encodedPath}`, requestUrl).toString();
}

export function tryExtractNetworkStorageKey(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const path = new URL(value, "https://artclub.invalid").pathname;
    const prefix = "/api/network/media/";
    if (!path.startsWith(prefix)) return undefined;
    const key = path.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    return isSafeNetworkStorageKey(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

export function hydrateNetworkMediaKeys<T>(input: T): T {
  if (!input || typeof input !== "object") return input;
  const value = { ...(input as Record<string, unknown>) };
  const pairs = [
    ["profileImageUrl", "profileImageStorageKey"],
    ["coverImageUrl", "coverImageStorageKey"],
    ["customImageUrl", "customImageStorageKey"],
  ] as const;
  for (const [urlKey, storageKey] of pairs) {
    if (!(urlKey in value) && !(storageKey in value)) continue;
    const derived = tryExtractNetworkStorageKey(value[urlKey]);
    if (derived) value[storageKey] = derived;
    else if (!value[storageKey]) value[storageKey] = "";
  }
  return value as T;
}

export function resolveNetworkMediaForRead(url: string | null | undefined, storageKey?: string | null) {
  const key = storageKey || tryExtractNetworkStorageKey(url) || tryExtractS3KeyFromUrl(url);
  if (!key || !isSafeNetworkStorageKey(key)) return url || "";
  return getPublicS3Url(key) || `/api/network/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function resolveNetworkMediaItems(items: any[]) {
  return (items || []).map(item => ({ ...item, url: resolveNetworkMediaForRead(item.url, item.storageKey), ...(item.posterUrl ? { posterUrl: resolveNetworkMediaForRead(item.posterUrl, item.posterStorageKey) } : {}) }));
}
