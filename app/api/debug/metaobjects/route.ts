import { NextResponse } from "next/server";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function GET() {
  try {
    const shop = mustEnv("SHOPIFY_SHOP_DOMAIN");
    const token = mustEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
    const version = process.env.SHOPIFY_API_VERSION || "2024-10";

    const url = `https://${shop}/admin/api/${version}/graphql.json`;

    // Lists metaobject definitions so we can see your artist type + fields
    const query = `
      query {
        metaobjectDefinitions(first: 50) {
          edges {
            node {
              id
              type
              name
              fieldDefinitions {
                key
                name
                type { name }
              }
            }
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
      body: JSON.stringify({ query }),
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, status: res.status, text }, { status: 500 });

    const json = JSON.parse(text);
    return NextResponse.json({ ok: true, data: json.data, errors: json.errors ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
