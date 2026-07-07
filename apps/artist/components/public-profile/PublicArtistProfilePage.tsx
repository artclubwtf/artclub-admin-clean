"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { PublicArtistArtworkItem, PublicArtistProfilePageData } from "@/lib/types";
import {
  PublicArtistProfileView,
  publicArtistProfileTabs,
  type PublicArtistProfileTabKey,
} from "@/components/public-profile/PublicArtistProfileView";

type PublicArtistProfilePageProps = {
  profile: PublicArtistProfilePageData;
  headerActions?: ReactNode;
};

type ArtistAnalyticsEventType =
  | "artist_profile_view"
  | "artwork_impression"
  | "artwork_view"
  | "artwork_click"
  | "shopify_product_click";

type ArtistAnalyticsSource = "artist_app";

const ARTCLUB_ADMIN_BASE_URL = (process.env.NEXT_PUBLIC_ARTCLUB_ADMIN_BASE_URL || "https://coral-app-tsv6g.ondigitalocean.app").replace(/\/+$/, "");
const ARTCLUB_ANALYTICS_ENDPOINT = `${ARTCLUB_ADMIN_BASE_URL}/api/analytics/track`;
const ARTCLUB_ARTIST_VISITOR_ID_KEY = "artclub_artist_visitor_id";

function trim(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTabFromHash(hash: string): PublicArtistProfileTabKey {
  const cleaned = hash.replace(/^#/, "").trim().toLowerCase();
  return (publicArtistProfileTabs.find((tab) => tab.key === cleaned)?.key || "artworks") as PublicArtistProfileTabKey;
}

function createVisitorId() {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `artist-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function getVisitorId() {
  if (typeof window === "undefined") return createVisitorId();

  try {
    const existing = window.localStorage.getItem(ARTCLUB_ARTIST_VISITOR_ID_KEY);
    if (existing) return existing;
  } catch {
    return createVisitorId();
  }

  const created = createVisitorId();
  try {
    window.localStorage.setItem(ARTCLUB_ARTIST_VISITOR_ID_KEY, created);
  } catch {
    return created;
  }
  return created;
}

function allowedEmbedParentOrigin() {
  try {
    const origin = new URL(document.referrer).origin;
    return origin === "https://artclub.wtf" || origin === "https://www.artclub.wtf" || /^https:\/\/[^/]+\.(?:myshopify\.com|shopifypreview\.com)$/.test(origin) ? origin : "";
  } catch { return ""; }
}

function getPageAnalyticsContext(): {
  source: ArtistAnalyticsSource;
  path: string;
  pageUrl: string;
  referrer: string;
} {
  if (typeof window === "undefined") {
    return {
      source: "artist_app",
      path: "",
      pageUrl: "",
      referrer: "",
    };
  }
  const path = `${window.location.pathname}${window.location.search}`;

  return {
    source: "artist_app",
    path,
    pageUrl: path,
    referrer: trim(document.referrer),
  };
}

async function sendArtistAnalyticsEvent(params: {
  eventType: ArtistAnalyticsEventType;
  source: ArtistAnalyticsSource;
  canonicalArtistId: string;
  artistName: string;
  artistSlug: string;
  path: string;
  pageHandle: string;
  pageUrl: string;
  referrer: string;
  artwork?: PublicArtistArtworkItem | null;
}) {
  const body = {
    eventType: params.eventType,
    source: params.source,
    canonicalArtistId: params.canonicalArtistId,
    artistName: params.artistName,
    artistSlug: params.artistSlug,
    canonicalProductId: params.artwork?.canonicalProductId || undefined,
    productKey: params.artwork?.productKey || undefined,
    productHandle: params.artwork?.productHandle || undefined,
    shopifyProductId: params.artwork?.shopifyProductId || undefined,
    path: params.path,
    pageHandle: params.pageHandle,
    pageUrl: params.pageUrl,
    referrer: params.referrer,
    timestamp: Date.now(),
    visitorId: getVisitorId(),
  };

  try {
    const response = await fetch(ARTCLUB_ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function PublicArtistProfilePage({ profile, headerActions }: PublicArtistProfilePageProps) {
  const [activeTab, setActiveTab] = useState<PublicArtistProfileTabKey>("artworks");
  const [selectedArtwork, setSelectedArtwork] = useState<PublicArtistArtworkItem | null>(null);

  const artworksByProductKey = useMemo(() => new Map(profile.artworks.map((artwork) => [artwork.productKey, artwork])), [profile.artworks]);

  useEffect(() => {
    setActiveTab(parseTabFromHash(window.location.hash));
    const handleHashChange = () => setActiveTab(parseTabFromHash(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const parentOrigin = allowedEmbedParentOrigin();
    if (!parentOrigin || window.parent === window) return;
    let frame = 0;
    const sendHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => window.parent.postMessage({ type: "artclub:artist-height", height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) }, parentOrigin));
    };
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.documentElement);
    window.addEventListener("load", sendHeight);
    sendHeight();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("load", sendHeight); };
  }, []);

  useEffect(() => {
    async function trackArtistProfileView() {
      const context = getPageAnalyticsContext();
      await sendArtistAnalyticsEvent({
        eventType: "artist_profile_view",
        source: context.source,
        canonicalArtistId: profile.canonicalArtistId,
        artistName: profile.displayName,
        artistSlug: profile.slug,
        path: context.path,
        pageHandle: profile.slug,
        pageUrl: context.pageUrl,
        referrer: context.referrer,
      });
    }

    void trackArtistProfileView();
  }, [profile.canonicalArtistId, profile.displayName, profile.slug]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") return;

    const seenProductKeys = new Set<string>();
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;

          const productKey = trim(entry.target.getAttribute("data-artclub-product-key"));
          if (!productKey || seenProductKeys.has(productKey)) return;

          const artwork = artworksByProductKey.get(productKey);
          if (!artwork) return;

          seenProductKeys.add(productKey);
          void (async () => {
            const context = getPageAnalyticsContext();
            await sendArtistAnalyticsEvent({
              eventType: "artwork_impression",
              source: context.source,
              canonicalArtistId: profile.canonicalArtistId,
              artistName: profile.displayName,
              artistSlug: profile.slug,
              path: context.path,
              pageHandle: profile.slug,
              pageUrl: context.pageUrl,
              referrer: context.referrer,
              artwork,
            });
          })();
          observer.unobserve(entry.target);
        });
      },
      { threshold: [0.5] },
    );

    document.querySelectorAll<HTMLElement>("[data-artclub-artwork-card='true']").forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [artworksByProductKey, profile.canonicalArtistId, profile.displayName, profile.slug]);

  function changeTab(tab: PublicArtistProfileTabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }

  function trackArtworkEvent(eventType: Exclude<ArtistAnalyticsEventType, "artist_profile_view">, artwork: PublicArtistArtworkItem) {
    void (async () => {
      const context = getPageAnalyticsContext();
      await sendArtistAnalyticsEvent({
        eventType,
        source: context.source,
        canonicalArtistId: profile.canonicalArtistId,
        artistName: profile.displayName,
        artistSlug: profile.slug,
        path: context.path,
        pageHandle: profile.slug,
        pageUrl: context.pageUrl,
        referrer: context.referrer,
        artwork,
      });
    })();
  }

  function handleSelectArtwork(artwork: PublicArtistArtworkItem) {
    trackArtworkEvent("artwork_click", artwork);
    trackArtworkEvent("artwork_view", artwork);
    setSelectedArtwork(artwork);
  }

  return (
    <PublicArtistProfileView
      profile={profile}
      headerActions={headerActions}
      activeTab={activeTab}
      selectedArtwork={selectedArtwork}
      onArtworkClose={() => setSelectedArtwork(null)}
      onArtworkSelect={handleSelectArtwork}
      onShopifyProductClick={(artwork) => trackArtworkEvent("shopify_product_click", artwork)}
      onTabChange={changeTab}
    />
  );
}
