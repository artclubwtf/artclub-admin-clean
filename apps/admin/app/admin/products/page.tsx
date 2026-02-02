import { fetchProducts } from "@/lib/shopify";

export default async function ProductsPage() {
  try {
    const products = await fetchProducts(25);

    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Products</h1>
        <p style={{ opacity: 0.7, marginTop: 6 }}>Loaded {products.length} products from Shopify.</p>

        <ul style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {products.map((p) => (
            <li key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{p.id}</div>
            </li>
          ))}
        </ul>
      </main>
    );
  } catch (err: any) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Products</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>
          Error loading products: {err?.message ?? String(err)}
        </p>
        <p style={{ marginTop: 8, opacity: 0.7 }}>
          Check SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, and API scopes (Products: read).
        </p>
      </main>
    );
  }
}
