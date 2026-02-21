"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type CatalogItemType = "artwork" | "event";

type CatalogItem = {
  id: string;
  type: CatalogItemType;
  title: string;
  sku: string | null;
  priceGrossCents: number;
  vatRate: 0 | 7 | 19;
  currency: "EUR";
  imageUrl: string | null;
  artistName: string | null;
  tags: string[];
  isActive: boolean;
};

type CartLine = {
  itemId: string;
  type: CatalogItemType;
  title: string;
  imageUrl: string | null;
  artistName: string | null;
  priceGrossCents: number;
  vatRate: 0 | 7 | 19;
  qty: number;
};

type CustomerType = "b2c" | "b2b";

const CART_STORAGE_KEY = "ac_pos_cart_session_v1";
const CUSTOMER_TYPE_STORAGE_KEY = "ac_pos_customer_type_v1";

function formatEuroFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function computeNetCents(grossCents: number, vatRate: 0 | 7 | 19) {
  if (vatRate === 0) return grossCents;
  return Math.round((grossCents * 100) / (100 + vatRate));
}

function readInitialCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const rawCart = window.sessionStorage.getItem(CART_STORAGE_KEY);
    if (!rawCart) return [];
    const parsed = JSON.parse(rawCart) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line) =>
        line &&
        typeof line.itemId === "string" &&
        typeof line.title === "string" &&
        typeof line.priceGrossCents === "number" &&
        typeof line.qty === "number",
    );
  } catch {
    return [];
  }
}

function readInitialCustomerType(): CustomerType {
  if (typeof window === "undefined") return "b2c";
  try {
    const value = window.sessionStorage.getItem(CUSTOMER_TYPE_STORAGE_KEY);
    return value === "b2b" ? "b2b" : "b2c";
  } catch {
    return "b2c";
  }
}

export default function PosMainClient() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<CatalogItemType>("artwork");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const [cart, setCart] = useState<CartLine[]>(readInitialCart);
  const [customerType, setCustomerType] = useState<CustomerType>(readInitialCustomerType);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);

  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const addAnimationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/pos/catalog", { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; items?: CatalogItem[]; error?: string }
          | null;
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load POS catalog");
        }
        setItems(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load POS catalog";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage failures
    }
  }, [cart]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CUSTOMER_TYPE_STORAGE_KEY, customerType);
    } catch {
      // ignore storage failures
    }
  }, [customerType]);

  useEffect(() => {
    return () => {
      if (addAnimationTimeoutRef.current !== null) {
        window.clearTimeout(addAnimationTimeoutRef.current);
      }
    };
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => item.isActive && item.type === tab),
    [items, tab],
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of activeItems) {
      for (const tag of item.tags || []) {
        const normalized = tag.trim();
        if (normalized) tags.add(normalized);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [activeItems]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activeItems.filter((item) => {
      if (activeTag !== "all" && !(item.tags || []).includes(activeTag)) {
        return false;
      }
      if (!needle) return true;

      const title = item.title.toLowerCase();
      const artist = (item.artistName || "").toLowerCase();
      const sku = (item.sku || "").toLowerCase();
      const tags = (item.tags || []).join(" ").toLowerCase();
      return title.includes(needle) || artist.includes(needle) || sku.includes(needle) || tags.includes(needle);
    });
  }, [activeItems, activeTag, query]);

  const qtyByItemId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      map.set(line.itemId, line.qty);
    }
    return map;
  }, [cart]);

  const cartItemCount = useMemo(() => cart.reduce((sum, line) => sum + line.qty, 0), [cart]);

  const totals = useMemo(() => {
    let grossCents = 0;
    let netCents = 0;
    let vatCents = 0;

    for (const line of cart) {
      const lineGross = line.priceGrossCents * line.qty;
      const lineNet = computeNetCents(lineGross, line.vatRate);
      grossCents += lineGross;
      netCents += lineNet;
      vatCents += lineGross - lineNet;
    }

    return { grossCents, netCents, vatCents };
  }, [cart]);

  const onAddToCart = (item: CatalogItem) => {
    setCart((prev) => {
      const found = prev.find((line) => line.itemId === item.id);
      if (found) {
        return prev.map((line) => (line.itemId === item.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [
        ...prev,
        {
          itemId: item.id,
          type: item.type,
          title: item.title,
          imageUrl: item.imageUrl,
          artistName: item.artistName,
          priceGrossCents: item.priceGrossCents,
          vatRate: item.vatRate,
          qty: 1,
        },
      ];
    });

    setCheckoutMessage(null);
    setJustAddedId(item.id);
    if (addAnimationTimeoutRef.current !== null) {
      window.clearTimeout(addAnimationTimeoutRef.current);
    }
    addAnimationTimeoutRef.current = window.setTimeout(() => {
      setJustAddedId(null);
    }, 220);
  };

  const adjustQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => (line.itemId === itemId ? { ...line, qty: line.qty + delta } : line))
        .filter((line) => line.qty > 0),
    );
  };

  const clearCart = () => {
    setCart([]);
    setCheckoutMessage(null);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutMessage("Checkout flow is ready for transaction wiring. Totals are finalized in-cart.");
  };

  return (
    <main className="admin-dashboard">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-slate-500">POS</p>
            <h1 className="text-2xl font-semibold">Sales</h1>
            <p className="text-sm text-slate-600">Fast item pickup for cashier checkout.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/pos/settings" className="btnGhost">
              Settings
            </Link>
            <Link href="/admin/pos/transactions" className="btnGhost">
              Transactions
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-semibold transition ${
                tab === "artwork" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              onClick={() => {
                setTab("artwork");
                setActiveTag("all");
              }}
            >
              Artworks
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-semibold transition ${
                tab === "event" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              onClick={() => {
                setTab("event");
                setActiveTag("all");
              }}
            >
              Events
            </button>
            <div className="ml-auto text-xs text-slate-500">
              {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveTag("all");
              }}
              placeholder="Search title, artist, tags, SKU"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                activeTag === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"
              }`}
              onClick={() => setActiveTag("all")}
            >
              All
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  activeTag === tag ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"
                }`}
                onClick={() => setActiveTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-rose-700">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
                Loading catalog...
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
                No items found.
              </div>
            ) : (
              visibleItems.map((item) => {
                const inCartQty = qtyByItemId.get(item.id) || 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onAddToCart(item)}
                    className={`pos-card relative flex w-full flex-col overflow-hidden rounded border border-slate-200 bg-white text-left transition hover:-translate-y-[1px] hover:shadow-sm ${
                      justAddedId === item.id ? "pos-card-added" : ""
                    }`}
                  >
                    <div className="relative w-full overflow-hidden bg-slate-100" style={{ height: "180px" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl || "https://placehold.co/640x480?text=No+Image"}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                        width={640}
                        height={480}
                      />
                      {inCartQty > 0 && (
                        <span className="absolute right-2 top-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                          x{inCartQty}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <div className="line-clamp-2 min-h-10 text-sm font-semibold text-slate-900">{item.title}</div>
                      <div className="text-sm font-medium text-slate-700">€{formatEuroFromCents(item.priceGrossCents)}</div>
                      {item.type === "artwork" && item.artistName && (
                        <div className="text-xs text-slate-500">{item.artistName}</div>
                      )}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(item.tags || []).slice(0, 3).map((tag) => (
                          <span key={`${item.id}-${tag}`} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="card flex h-fit flex-col gap-3 lg:sticky lg:top-6">
          <div className="cardHeader">
            <strong>Cart</strong>
            <span className="text-xs text-slate-500">
              {cartItemCount} item{cartItemCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded border border-slate-200 p-2">
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-semibold ${customerType === "b2c" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setCustomerType("b2c")}
            >
              B2C
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-semibold ${customerType === "b2b" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setCustomerType("b2b")}
            >
              B2B
            </button>
          </div>

          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {cart.length === 0 ? (
              <div className="rounded border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
                Add items from the catalog to begin.
              </div>
            ) : (
              cart.map((line) => (
                <div key={line.itemId} className="rounded border border-slate-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{line.title}</p>
                      {line.artistName && <p className="text-xs text-slate-500">{line.artistName}</p>}
                      <p className="text-xs text-slate-500">
                        €{formatEuroFromCents(line.priceGrossCents)} each
                      </p>
                    </div>
                    <div className="text-right text-sm font-semibold text-slate-900">
                      €{formatEuroFromCents(line.priceGrossCents * line.qty)}
                    </div>
                  </div>

                  <div className="mt-2 inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1">
                    <button
                      type="button"
                      className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                      onClick={() => adjustQty(line.itemId, -1)}
                    >
                      -
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold">{line.qty}</span>
                    <button
                      type="button"
                      className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                      onClick={() => adjustQty(line.itemId, +1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2 rounded border border-slate-200 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Gross</span>
              <span className="font-semibold">€{formatEuroFromCents(totals.grossCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Net</span>
              <span className="font-semibold">€{formatEuroFromCents(totals.netCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">VAT</span>
              <span className="font-semibold">€{formatEuroFromCents(totals.vatCents)}</span>
            </div>
          </div>

          {checkoutMessage && <p className="text-xs text-emerald-700">{checkoutMessage}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btnGhost"
              onClick={clearCart}
              disabled={cart.length === 0}
            >
              Clear cart
            </button>
            <button
              type="button"
              className="btnPrimary"
              onClick={handleCheckout}
              disabled={cart.length === 0}
            >
              Checkout
            </button>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .pos-card-added {
          animation: pos-bump 220ms ease-out;
        }
        @keyframes pos-bump {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(0.98);
          }
          70% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </main>
  );
}
