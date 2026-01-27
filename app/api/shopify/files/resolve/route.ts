import { NextResponse } from "next/server";

function mustEnv(name: string): string {
  const value = process.env[name] || (name === "SHOPIFY_SHOP_DOMAIN" ? process.env.SHOPIFY_STORE_DOMAIN : undefined);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

type ResolvedFile = {
  id: string;
  url: string | null;
  alt?: string | null;
  previewImage?: string | null;
};

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
      return NextResponse.json({ files: [] }, { status: 200 });
    }

    const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
    const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const version = process.env.SHOPIFY_API_VERSION || "2024-10";
    const url = `https://${shop}/admin/api/${version}/graphql.json`;

    const query = `
      query ResolveFiles($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          __typename
          ... on MediaImage {
            image { url altText }
          }
          ... on Video {
            previewImage { url }
            sources { url mimeType }
          }
          ... on ExternalVideo {
            embedUrl
            previewImage { url }
          }
          ... on GenericFile {
            url
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
      body: JSON.stringify({ query, variables: { ids } }),
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
    const files = nodes
      .filter((node) => node && node.id)
      .map((node): ResolvedFile => {
        const url =
          node.image?.url ||
          node.previewImage?.url ||
          node.url ||
          node.embedUrl ||
          (Array.isArray(node.sources) ? node.sources[0]?.url : null) ||
          null;
        const previewImage = node.previewImage?.url || node.image?.url || null;
        return {
          id: node.id,
          url,
          alt: node.image?.altText || null,
          previewImage,
        };
      });

    return NextResponse.json({ files }, { status: 200 });
  } catch (err: any) {
    console.error("Failed to resolve Shopify files", err);
    return NextResponse.json({ error: err?.message || "Failed to resolve files" }, { status: 500 });
  }
}
