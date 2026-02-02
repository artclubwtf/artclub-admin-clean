import { NextResponse } from "next/server";

type CacheEntry = { expiresAt: number; value: ResolvedItem };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

type ResolvedItem = {
  id: string;
  kind: string;
  url: string | null;
  filename?: string | null;
};

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getCached(id: string) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(id);
    return null;
  }
  return entry.value;
}

function setCached(item: ResolvedItem) {
  cache.set(item.id, { value: item, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsRaw = searchParams.get("ids") || "";
    const ids = Array.from(
      new Set(
        idsRaw
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ).slice(0, 20);

    if (!ids.length) {
      return NextResponse.json({ ok: true, items: [] }, { status: 200 });
    }

    const cachedItems: ResolvedItem[] = [];
    const missing: string[] = [];
    for (const id of ids) {
      const cached = getCached(id);
      if (cached) cachedItems.push(cached);
      else missing.push(id);
    }

    if (!missing.length) {
      return NextResponse.json({ ok: true, items: cachedItems }, { status: 200 });
    }

    const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
    const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const version = process.env.SHOPIFY_API_VERSION || "2024-10";
    const url = `https://${shop}/admin/api/${version}/graphql.json`;

    const query = `
      query ResolveMedia($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          __typename
          ... on MediaImage {
            image { url altText }
          }
          ... on File {
            fileStatus
            filename
          }
          ... on GenericFile {
            url
          }
          ... on Video {
            previewImage { url }
            sources { url mimeType }
          }
          ... on ExternalVideo {
            previewImage { url }
            embedUrl
          }
        }
      }
    `;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables: { ids: missing } }),
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `Shopify API error ${res.status}`, details: text }, { status: 500 });
    }

    const json = JSON.parse(text) as any;
    if (json.errors) {
      return NextResponse.json({ error: "Shopify GraphQL errors", details: json.errors }, { status: 500 });
    }

    const nodes = (json.data?.nodes ?? []) as any[];
    const resolved = nodes
      .filter((node) => node && node.id)
      .map((node): ResolvedItem => {
        const url =
          node.image?.url ||
          node.previewImage?.url ||
          node.url ||
          node.embedUrl ||
          (Array.isArray(node.sources) ? node.sources[0]?.url : null) ||
          null;
        return {
          id: node.id,
          kind: node.__typename || "Unknown",
          url,
          filename: node.filename || node.image?.altText || null,
        };
      });

    resolved.forEach(setCached);

    const resolvedIds = new Set(resolved.map((item) => item.id));
    const missingFallback = missing
      .filter((id) => !resolvedIds.has(id))
      .map((id): ResolvedItem => ({ id, kind: "Unknown", url: null, filename: null }));
    missingFallback.forEach(setCached);

    return NextResponse.json({ ok: true, items: [...cachedItems, ...resolved, ...missingFallback] }, { status: 200 });
  } catch (err: any) {
    console.error("Failed to resolve Shopify media", err);
    return NextResponse.json({ error: err?.message || "Failed to resolve media" }, { status: 500 });
  }
}
