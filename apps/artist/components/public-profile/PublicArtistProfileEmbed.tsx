"use client";

import { useEffect, useRef, useState } from "react";

import type { PublicArtistArtworkItem, PublicArtistProfilePageData } from "@/lib/types";
import {
  PublicArtistProfileView,
  type PublicArtistProfileTabKey,
} from "@/components/public-profile/PublicArtistProfileView";

export type ArtistEmbedTrackEventType =
  | "artist_profile_view"
  | "artwork_impression"
  | "artwork_view"
  | "artwork_click"
  | "shopify_product_click";

type PublicArtistProfileEmbedProps = {
  profile: PublicArtistProfilePageData;
  trackingSource: "shopify_artist_embed";
  onReady?: (artist: { canonicalArtistId: string; slug: string; displayName: string }) => void;
  onTrackEvent?: (eventType: ArtistEmbedTrackEventType, artwork?: PublicArtistArtworkItem | null) => void;
};

function trim(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function PublicArtistProfileEmbed({
  profile,
  trackingSource,
  onReady,
  onTrackEvent,
}: PublicArtistProfileEmbedProps) {
  const [activeTab, setActiveTab] = useState<PublicArtistProfileTabKey>("artworks");
  const [selectedArtwork, setSelectedArtwork] = useState<PublicArtistArtworkItem | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const readyReportedRef = useRef(false);

  useEffect(() => {
    if (readyReportedRef.current) return;
    readyReportedRef.current = true;
    onReady?.({
      canonicalArtistId: profile.canonicalArtistId,
      slug: profile.slug,
      displayName: profile.displayName,
    });
  }, [onReady, profile.canonicalArtistId, profile.displayName, profile.slug]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") return;
    const scope = rootRef.current;
    if (!scope) return;

    const seenProductKeys = new Set<string>();
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;

          const productKey = trim(entry.target.getAttribute("data-artclub-product-key"));
          if (!productKey || seenProductKeys.has(productKey)) return;

          const artwork = profile.artworks.find((item) => item.productKey === productKey) || null;
          if (!artwork) return;

          seenProductKeys.add(productKey);
          observer.unobserve(entry.target);
          onTrackEvent?.("artwork_impression", artwork);
        });
      },
      { threshold: [0.5] },
    );

    scope.querySelectorAll<HTMLElement>("[data-artclub-artwork-card='true']").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [onTrackEvent, profile.artworks]);

  function handleSelectArtwork(artwork: PublicArtistArtworkItem) {
    onTrackEvent?.("artwork_click", artwork);
    onTrackEvent?.("artwork_view", artwork);
    setSelectedArtwork(artwork);
  }

  return (
    <div ref={rootRef}>
      <PublicArtistProfileView
        profile={profile}
        activeTab={activeTab}
        selectedArtwork={selectedArtwork}
        trackingSource={trackingSource}
        onArtworkClose={() => setSelectedArtwork(null)}
        onArtworkSelect={handleSelectArtwork}
        onShopifyProductClick={(artwork) => onTrackEvent?.("shopify_product_click", artwork)}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
