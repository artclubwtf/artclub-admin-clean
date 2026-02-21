"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type CatalogItemType = "artwork" | "event";
type DeliveryMethod = "pickup" | "shipping" | "forwarding";
type EditionType = "unique" | "edition";
type CustomerType = "b2c" | "b2b";

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

type PosLocation = {
  id: string;
  name: string;
  address: string;
};

type PosTerminal = {
  id: string;
  locationId: string;
  provider: string;
  terminalRef: string;
  label: string;
  status: string;
  lastSeenAt: string | null;
};

type BuyerForm = {
  name: string;
  company: string;
  billingAddress: string;
  shippingAddress: string;
  shippingSameAsBilling: boolean;
  email: string;
  phone: string;
};

type ContractArtworkFormLine = {
  itemId: string;
  artistName: string;
  title: string;
  year: string;
  techniqueSize: string;
  editionType: EditionType;
};

type ContractForm = {
  deliveryMethod: DeliveryMethod;
  estimatedDeliveryDate: string;
  artworks: ContractArtworkFormLine[];
};

const CART_STORAGE_KEY = "ac_pos_cart_session_v1";
const CUSTOMER_TYPE_STORAGE_KEY = "ac_pos_customer_type_v1";
const CONTRACT_TERMS_LINK = "https://artclub.wtf/policies/terms-of-service";
const CONTRACT_SELLER_NAME = "Artclub Mixed Media GmbH";

function formatEuroFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function initialContractForm(): ContractForm {
  return {
    deliveryMethod: "pickup",
    estimatedDeliveryDate: "",
    artworks: [],
  };
}

function toOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export default function PosMainClient() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [locations, setLocations] = useState<PosLocation[]>([]);
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<CatalogItemType>("artwork");
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>("all");

  const [cart, setCart] = useState<CartLine[]>(readInitialCart);
  const [customerType, setCustomerType] = useState<CustomerType>(readInitialCustomerType);
  const [buyerForm, setBuyerForm] = useState<BuyerForm>({
    name: "",
    company: "",
    billingAddress: "",
    shippingAddress: "",
    shippingSameAsBilling: true,
    email: "",
    phone: "",
  });

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractForm, setContractForm] = useState<ContractForm>(initialContractForm);
  const [hasSignature, setHasSignature] = useState(false);

  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const addAnimationTimeoutRef = useRef<number | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingSignatureRef = useRef(false);
  const signatureLastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/pos/catalog", { cache: "no-store" }),
      fetch("/api/admin/pos/settings", { cache: "no-store" }),
    ])
      .then(async ([catalogRes, settingsRes]) => {
        const catalogPayload = (await catalogRes.json().catch(() => null)) as
          | { ok?: boolean; items?: CatalogItem[]; error?: string }
          | null;
        if (!catalogRes.ok || !catalogPayload?.ok) {
          throw new Error(catalogPayload?.error || "Failed to load POS catalog");
        }

        const settingsPayload = (await settingsRes.json().catch(() => null)) as
          | {
              ok?: boolean;
              settings?: {
                locations?: PosLocation[];
                terminals?: PosTerminal[];
              };
              error?: string;
            }
          | null;
        if (!settingsRes.ok || !settingsPayload?.ok) {
          throw new Error(settingsPayload?.error || "Failed to load POS settings");
        }

        const nextItems = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
        const nextLocations = Array.isArray(settingsPayload.settings?.locations) ? settingsPayload.settings.locations : [];
        const nextTerminals = Array.isArray(settingsPayload.settings?.terminals) ? settingsPayload.settings.terminals : [];

        setItems(nextItems);
        setLocations(nextLocations);
        setTerminals(nextTerminals);
        if (nextTerminals.length > 0) {
          setSelectedTerminalId((prev) => prev || nextTerminals[0].id);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load POS data";
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

  useEffect(() => {
    if (!contractModalOpen || !signatureCanvasRef.current) return;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }, [contractModalOpen]);

  const activeItems = useMemo(
    () => items.filter((item) => item.isActive && item.type === tab),
    [items, tab],
  );

  const selectedTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === selectedTerminalId) || null,
    [terminals, selectedTerminalId],
  );

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedTerminal?.locationId) || null,
    [locations, selectedTerminal?.locationId],
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
  const hasArtworkInCart = useMemo(() => cart.some((line) => line.type === "artwork"), [cart]);

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
    setCheckoutError(null);
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
    setCheckoutError(null);
  };

  const updateBuyer = (key: keyof BuyerForm, value: string | boolean) => {
    setBuyerForm((prev) => ({ ...prev, [key]: value }));
  };

  const startContractStep = () => {
    const artworkLines = cart
      .filter((line) => line.type === "artwork")
      .map((line) => ({
        itemId: line.itemId,
        title: line.title,
        artistName: line.artistName || "",
        year: "",
        techniqueSize: "",
        editionType: "unique" as EditionType,
      }));
    setContractForm({
      deliveryMethod: "pickup",
      estimatedDeliveryDate: "",
      artworks: artworkLines,
    });
    setContractModalOpen(true);
    setCheckoutError(null);
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const onSignaturePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = getCanvasPoint(event);
    if (!ctx || !point || !canvas) return;

    canvas.setPointerCapture(event.pointerId);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    signatureLastPointRef.current = point;
    isDrawingSignatureRef.current = true;
  };

  const onSignaturePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingSignatureRef.current) return;
    event.preventDefault();
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = getCanvasPoint(event);
    const lastPoint = signatureLastPointRef.current;
    if (!ctx || !point || !lastPoint) return;

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    signatureLastPointRef.current = point;
    setHasSignature(true);
  };

  const onSignaturePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    isDrawingSignatureRef.current = false;
    signatureLastPointRef.current = null;
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const pollCheckoutStatus = async (txId: string) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await sleep(1000);
      const res = await fetch(`/api/admin/pos/checkout/status?txId=${encodeURIComponent(txId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        if (attempt >= 3) {
          setCheckoutError(payload?.error || "Failed to poll payment status");
          return;
        }
        continue;
      }

      const status = payload.status || "payment_pending";
      if (status === "paid") {
        clearCart();
        setContractModalOpen(false);
        setCheckoutMessage(`Payment approved. Transaction ${txId} is paid.`);
        return;
      }
      if (status === "failed" || status === "cancelled" || status === "refunded" || status === "storno") {
        setCheckoutError(`Payment ended with status: ${status}`);
        return;
      }
    }
    setCheckoutError("Payment still pending. Keep polling from transactions view.");
  };

  const runCheckout = async (contractPayload?: {
    artworks: ContractArtworkFormLine[];
    deliveryMethod: DeliveryMethod;
    estimatedDeliveryDate?: string;
    buyerSignatureDataUrl: string;
  }) => {
    if (cart.length === 0) return;
    if (!selectedTerminal || !selectedLocation) {
      setCheckoutError("No terminal configured. Add a POS terminal in settings.");
      return;
    }

    const buyerName = buyerForm.name.trim() || "Walk-in customer";
    const billingAddress = buyerForm.billingAddress.trim();
    const shippingAddress = buyerForm.shippingSameAsBilling ? billingAddress : buyerForm.shippingAddress.trim();

    setCheckingOut(true);
    setCheckoutError(null);
    setCheckoutMessage(null);
    try {
      const res = await fetch("/api/admin/pos/checkout/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocation.id,
          terminalId: selectedTerminal.id,
          cart: cart.map((line) => ({
            itemId: line.itemId,
            qty: line.qty,
          })),
          buyer: {
            type: customerType,
            name: buyerName,
            company: toOptionalString(buyerForm.company),
            billingAddress: toOptionalString(billingAddress),
            shippingAddress: toOptionalString(shippingAddress),
            email: toOptionalString(buyerForm.email),
            phone: toOptionalString(buyerForm.phone),
          },
          contract: contractPayload
            ? {
                artworks: contractPayload.artworks.map((line) => ({
                  itemId: line.itemId,
                  artistName: toOptionalString(line.artistName),
                  title: toOptionalString(line.title),
                  year: toOptionalString(line.year),
                  techniqueSize: toOptionalString(line.techniqueSize),
                  editionType: line.editionType,
                })),
                deliveryMethod: contractPayload.deliveryMethod,
                estimatedDeliveryDate: toOptionalString(contractPayload.estimatedDeliveryDate || ""),
                buyerSignatureDataUrl: contractPayload.buyerSignatureDataUrl,
              }
            : undefined,
        }),
      });

      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; txId?: string; providerTxId?: string; status?: string; error?: string }
        | null;
      if (!res.ok || !payload?.ok || !payload.txId) {
        throw new Error(payload?.error || "Failed to start checkout");
      }

      if (payload.status === "paid") {
        clearCart();
        setContractModalOpen(false);
        setCheckoutMessage(`Payment approved. Transaction ${payload.txId} is paid.`);
        return;
      }

      setCheckoutMessage(`Payment started (${payload.providerTxId || "provider pending"}). Waiting for approval...`);
      await pollCheckoutStatus(payload.txId);
    } catch (checkoutErr: unknown) {
      const message = checkoutErr instanceof Error ? checkoutErr.message : "Failed to start checkout";
      setCheckoutError(message);
    } finally {
      setCheckingOut(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (hasArtworkInCart) {
      startContractStep();
      return;
    }
    await runCheckout();
  };

  const handleContractCheckout = async () => {
    if (!hasArtworkInCart) {
      await runCheckout();
      return;
    }
    if (!buyerForm.name.trim()) {
      setCheckoutError("Buyer name is required for artwork contracts.");
      return;
    }
    if (!buyerForm.billingAddress.trim()) {
      setCheckoutError("Billing address is required for artwork contracts.");
      return;
    }
    if (!buyerForm.shippingSameAsBilling && !buyerForm.shippingAddress.trim()) {
      setCheckoutError("Shipping address is required when shipping differs from billing.");
      return;
    }
    if (!hasSignature || !signatureCanvasRef.current) {
      setCheckoutError("Buyer signature is required.");
      return;
    }

    const signatureDataUrl = signatureCanvasRef.current.toDataURL("image/png");
    await runCheckout({
      artworks: contractForm.artworks,
      deliveryMethod: contractForm.deliveryMethod,
      estimatedDeliveryDate: contractForm.estimatedDeliveryDate,
      buyerSignatureDataUrl: signatureDataUrl,
    });
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

          <div className="space-y-2 rounded border border-slate-200 p-3">
            <label className="space-y-1">
              <span className="text-xs text-slate-600">Terminal</span>
              <select
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                value={selectedTerminalId}
                onChange={(event) => setSelectedTerminalId(event.target.value)}
              >
                {terminals.length === 0 ? <option value="">No terminals configured</option> : null}
                {terminals.map((terminal) => {
                  const location = locations.find((entry) => entry.id === terminal.locationId);
                  return (
                    <option key={terminal.id} value={terminal.id}>
                      {terminal.label} {location ? `(${location.name})` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            {selectedLocation && (
              <p className="text-xs text-slate-500">
                {selectedLocation.name} · {selectedLocation.address}
              </p>
            )}
          </div>

          <div className="grid gap-2 rounded border border-slate-200 p-3">
            <label className="space-y-1">
              <span className="text-xs text-slate-600">Buyer name</span>
              <input
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                value={buyerForm.name}
                onChange={(event) => updateBuyer("name", event.target.value)}
                placeholder="Walk-in customer"
              />
            </label>
            {customerType === "b2b" && (
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Company</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={buyerForm.company}
                  onChange={(event) => updateBuyer("company", event.target.value)}
                />
              </label>
            )}
            <label className="space-y-1">
              <span className="text-xs text-slate-600">Billing address</span>
              <textarea
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={buyerForm.billingAddress}
                onChange={(event) => updateBuyer("billingAddress", event.target.value)}
              />
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={buyerForm.shippingSameAsBilling}
                onChange={(event) => updateBuyer("shippingSameAsBilling", event.target.checked)}
              />
              <span className="text-xs text-slate-600">Shipping same as billing</span>
            </label>
            {!buyerForm.shippingSameAsBilling && (
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Shipping address</span>
                <textarea
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  value={buyerForm.shippingAddress}
                  onChange={(event) => updateBuyer("shippingAddress", event.target.value)}
                />
              </label>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Email</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={buyerForm.email}
                  onChange={(event) => updateBuyer("email", event.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-600">Phone</span>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={buyerForm.phone}
                  onChange={(event) => updateBuyer("phone", event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
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
          {checkoutError && <p className="text-xs text-rose-700">{checkoutError}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btnGhost"
              onClick={clearCart}
              disabled={cart.length === 0 || checkingOut}
            >
              Clear cart
            </button>
            <button
              type="button"
              className="btnPrimary"
              onClick={handleCheckout}
              disabled={cart.length === 0 || checkingOut || terminals.length === 0}
            >
              {checkingOut ? "Processing..." : "Checkout"}
            </button>
          </div>
        </aside>
      </div>

      {contractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-4xl space-y-4">
            <div className="cardHeader">
              <strong>Artwork Purchase Contract</strong>
              <button
                type="button"
                className="btnGhost"
                onClick={() => {
                  if (!checkingOut) setContractModalOpen(false);
                }}
                disabled={checkingOut}
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-3 rounded border border-slate-200 p-3">
                <h3 className="text-sm font-semibold">Buyer details</h3>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Name *</span>
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={buyerForm.name}
                    onChange={(event) => updateBuyer("name", event.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Company</span>
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={buyerForm.company}
                    onChange={(event) => updateBuyer("company", event.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Billing address *</span>
                  <textarea
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    rows={2}
                    value={buyerForm.billingAddress}
                    onChange={(event) => updateBuyer("billingAddress", event.target.value)}
                  />
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={buyerForm.shippingSameAsBilling}
                    onChange={(event) => updateBuyer("shippingSameAsBilling", event.target.checked)}
                  />
                  <span className="text-xs text-slate-600">Shipping same as billing</span>
                </label>
                {!buyerForm.shippingSameAsBilling && (
                  <label className="space-y-1">
                    <span className="text-xs text-slate-600">Shipping address *</span>
                    <textarea
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      rows={2}
                      value={buyerForm.shippingAddress}
                      onChange={(event) => updateBuyer("shippingAddress", event.target.value)}
                    />
                  </label>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-slate-600">Email</span>
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      value={buyerForm.email}
                      onChange={(event) => updateBuyer("email", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-slate-600">Phone</span>
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      value={buyerForm.phone}
                      onChange={(event) => updateBuyer("phone", event.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-3 rounded border border-slate-200 p-3">
                <h3 className="text-sm font-semibold">Delivery and legal</h3>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Delivery method *</span>
                  <select
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={contractForm.deliveryMethod}
                    onChange={(event) => setContractForm((prev) => ({ ...prev, deliveryMethod: event.target.value as DeliveryMethod }))}
                  >
                    <option value="pickup">Pickup</option>
                    <option value="shipping">Shipping</option>
                    <option value="forwarding">Forwarding</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-600">Estimated delivery date</span>
                  <input
                    type="date"
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                    value={contractForm.estimatedDeliveryDate}
                    onChange={(event) => setContractForm((prev) => ({ ...prev, estimatedDeliveryDate: event.target.value }))}
                  />
                </label>
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p>Seller signature: {CONTRACT_SELLER_NAME}</p>
                  <p>Timestamp: {new Date().toLocaleString()}</p>
                  <p>
                    Terms:{" "}
                    <a className="underline" href={CONTRACT_TERMS_LINK} target="_blank" rel="noreferrer">
                      {CONTRACT_TERMS_LINK}
                    </a>
                  </p>
                </div>
              </section>
            </div>

            <section className="space-y-2 rounded border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Artwork details</h3>
              <div className="space-y-3">
                {contractForm.artworks.map((artwork, index) => (
                  <div key={artwork.itemId} className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Artist name *</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={artwork.artistName}
                        onChange={(event) =>
                          setContractForm((prev) => ({
                            ...prev,
                            artworks: prev.artworks.map((line, lineIndex) =>
                              lineIndex === index ? { ...line, artistName: event.target.value } : line,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Artwork title *</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={artwork.title}
                        onChange={(event) =>
                          setContractForm((prev) => ({
                            ...prev,
                            artworks: prev.artworks.map((line, lineIndex) =>
                              lineIndex === index ? { ...line, title: event.target.value } : line,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Year</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={artwork.year}
                        onChange={(event) =>
                          setContractForm((prev) => ({
                            ...prev,
                            artworks: prev.artworks.map((line, lineIndex) =>
                              lineIndex === index ? { ...line, year: event.target.value } : line,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs text-slate-600">Technique / size</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={artwork.techniqueSize}
                        onChange={(event) =>
                          setContractForm((prev) => ({
                            ...prev,
                            artworks: prev.artworks.map((line, lineIndex) =>
                              lineIndex === index ? { ...line, techniqueSize: event.target.value } : line,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Unique / edition</span>
                      <select
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={artwork.editionType}
                        onChange={(event) =>
                          setContractForm((prev) => ({
                            ...prev,
                            artworks: prev.artworks.map((line, lineIndex) =>
                              lineIndex === index ? { ...line, editionType: event.target.value as EditionType } : line,
                            ),
                          }))
                        }
                      >
                        <option value="unique">Unique</option>
                        <option value="edition">Edition</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2 rounded border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Buyer signature *</h3>
                <button type="button" className="btnGhost" onClick={clearSignature}>
                  Clear
                </button>
              </div>
              <canvas
                ref={signatureCanvasRef}
                width={900}
                height={220}
                className="h-[160px] w-full rounded border border-slate-200 bg-white"
                onPointerDown={onSignaturePointerDown}
                onPointerMove={onSignaturePointerMove}
                onPointerUp={onSignaturePointerUp}
                onPointerLeave={onSignaturePointerUp}
              />
              {!hasSignature && <p className="text-xs text-amber-700">Draw buyer signature before continuing.</p>}
            </section>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btnGhost"
                onClick={() => setContractModalOpen(false)}
                disabled={checkingOut}
              >
                Cancel
              </button>
              <button type="button" className="btnPrimary" onClick={handleContractCheckout} disabled={checkingOut}>
                {checkingOut ? "Processing..." : "Sign & pay"}
              </button>
            </div>
          </div>
        </div>
      )}

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
