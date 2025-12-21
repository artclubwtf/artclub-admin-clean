"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApSection, ApSectionHeader, ApRow } from "@/components/artist/ApElements";

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

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied to Shopify",
};

const statusTone = (status: string) => {
  const key = status.toLowerCase();
  if (key === "approved" || key === "applied") return "success";
  if (key === "rejected") return "warn";
  if (key === "submitted" || key === "in_review") return "info";
  return "neutral";
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
      <ApSection>
        <ApSectionHeader
          title="Artworks"
          subtitle="Submit new artworks for review. The team will process your submission and publish to Shopify."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/artist/artworks/new" className="ap-btn">
                Submit new artwork
              </Link>
              <button
                type="button"
                className="ap-btn-ghost"
                onClick={() => {
                  loadRequests();
                  loadProducts();
                }}
              >
                Refresh
              </button>
            </div>
          }
        />
        <div className="ap-note">Keep uploads concise and add a short description so the team can process quickly.</div>
      </ApSection>

      <ApSection>
        <ApSectionHeader title="Status" subtitle="Track submissions and Shopify products" />
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="ap-section-title">Your submissions</div>
            <div className="ap-section-subtitle">Track artwork requests and their status.</div>

            {error && <div className="ap-note">Error: {error}</div>}
            {loadingRequests && <div className="ap-note">Loading submissions...</div>}

            {artworkRequests.length === 0 && !loadingRequests ? (
              <div className="ap-note">No submissions yet. Tap “Submit new artwork”.</div>
            ) : (
              <div className="ap-rows">
                {artworkRequests.map((req) => {
                  const title = req.payload?.title || "Untitled artwork";
                  const offering = req.payload?.offering === "original_plus_prints" ? "Original + prints" : "Print only";
                  const images = req.payload?.mediaIds?.length ?? 0;
                  const statusLabel = statusLabels[req.status] || req.status;

                  return (
                    <ApRow
                      key={req.id}
                      title={title}
                      subtitle={`${offering} • ${formatDate(req.createdAt)}`}
                      meta={
                        <>
                          <span className="ap-text-muted text-xs">{images} image(s)</span>
                          <span className="ap-badge" data-tone={statusTone(req.status)}>
                            {statusLabel}
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="ap-divider" />

          <div className="space-y-2">
            <div className="ap-section-title">In Shopify</div>
            <div className="ap-section-subtitle">Products already created for you.</div>

            {productError && <div className="ap-note">Error: {productError}</div>}
            {loadingProducts && <div className="ap-note">Loading Shopify products...</div>}

            {products.length === 0 && !loadingProducts ? (
              <div className="ap-note">No products yet. Once approved, your artworks show up here.</div>
            ) : (
              <div className="ap-grid">
                {products.map((p) => (
                  <div key={p.id} className="ap-media-tile">
                    <div className="ap-media-thumb" style={{ height: 160 }}>
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="ap-text-muted text-xs">No image</div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{p.title}</div>
                        <div className="ap-text-muted text-xs">
                          {p.price ? `${p.price} ${p.currency || "EUR"}` : "No price yet"}
                        </div>
                      </div>
                      <span className="ap-badge" data-tone="neutral">
                        {p.status || "draft"}
                      </span>
                    </div>
                    {p.adminUrl && (
                      <a href={p.adminUrl} target="_blank" rel="noreferrer" className="ap-btn-ghost" style={{ width: "100%" }}>
                        Open in Shopify
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ApSection>
    </div>
  );
}
