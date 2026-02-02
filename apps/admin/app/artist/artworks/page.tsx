"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Request = {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
  payload?: {
    title?: string;
    offering?: "print_only" | "original_plus_prints";
    mediaIds?: string[];
  };
};

type ShopifyProduct = {
  id: string;
  title: string;
  status: string;
  price?: string | null;
  currency?: string | null;
  imageUrl?: string | null;
  adminUrl?: string | null;
};

const statusStyles: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  in_review: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-rose-100 text-rose-800",
  applied: "bg-emerald-100 text-emerald-800",
};

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied to Shopify",
};

export default function ArtistArtworksPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoadingRequests(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/requests", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { requests?: Request[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load requests");
      setRequests(Array.isArray(payload?.requests) ? payload.requests : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load requests");
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadProducts = async () => {
    setLoadingProducts(true);
    setProductError(null);
    try {
      const res = await fetch("/api/artist/shopify/products", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { products?: ShopifyProduct[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load products");
      setProducts(Array.isArray(payload?.products) ? payload.products : []);
    } catch (err: any) {
      setProductError(err?.message ?? "Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadRequests();
    loadProducts();
  }, []);

  const artworkRequests = useMemo(
    () => requests.filter((r) => r.type === "artwork_create"),
    [requests],
  );

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleString() : "");

  return (
    <div className="space-y-4">
      <div className="artist-card space-y-2">
        <div className="artist-section-title">Artworks</div>
        <div className="artist-section-sub">
          Submit new artworks for review. The team will process your submission and publish to Shopify.
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/artist/artworks/new" className="artist-btn inline-flex w-auto">
            Submit new artwork
          </Link>
          <button type="button" className="artist-btn-ghost" onClick={() => { loadRequests(); loadProducts(); }}>
            Refresh
          </button>
        </div>
      </div>

      <div className="artist-card space-y-3">
        <div className="font-semibold text-slate-900">Your submissions</div>
        <div className="text-sm text-slate-600">Track artwork requests and their status.</div>

        {error && <div className="artist-placeholder">Error: {error}</div>}
        {loadingRequests && <div className="artist-placeholder">Loading submissions...</div>}

        {artworkRequests.length === 0 && !loadingRequests ? (
          <div className="artist-placeholder">No submissions yet. Tap “Submit new artwork”.</div>
        ) : (
          <div className="space-y-2">
            {artworkRequests.map((req) => {
              const statusClass = statusStyles[req.status] || "bg-slate-100 text-slate-700";
              const title = req.payload?.title || "Untitled artwork";
              const offering = req.payload?.offering === "original_plus_prints" ? "Original + prints" : "Print only";
              const images = req.payload?.mediaIds?.length ?? 0;
              const statusLabel = statusLabels[req.status] || req.status;

              return (
                <div key={req.id} className="artist-subtle-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{title}</div>
                      <div className="text-sm text-slate-600">{offering}</div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>{images} image(s)</span>
                    <span>•</span>
                    <span>{formatDate(req.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="artist-card space-y-3">
        <div className="font-semibold text-slate-900">In Shopify</div>
        <div className="text-sm text-slate-600">Products already created for you.</div>

        {productError && <div className="artist-placeholder">Error: {productError}</div>}
        {loadingProducts && <div className="artist-placeholder">Loading Shopify products...</div>}

        {products.length === 0 && !loadingProducts ? (
          <div className="artist-placeholder">No products yet. Once approved, your artworks show up here.</div>
        ) : (
          <div className="artist-grid">
            {products.map((p) => (
              <div key={p.id} className="artist-media-card">
                <div className="artist-media-preview" style={{ height: 160 }}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-xs text-slate-500">No image</div>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{p.title}</div>
                    <div className="text-xs text-slate-500">{p.price ? `${p.price} ${p.currency || "EUR"}` : "No price yet"}</div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {p.status || "draft"}
                  </div>
                </div>
                {p.adminUrl && (
                  <a
                    href={p.adminUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="artist-btn-ghost text-center"
                    style={{ width: "100%" }}
                  >
                    Open in Shopify
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
