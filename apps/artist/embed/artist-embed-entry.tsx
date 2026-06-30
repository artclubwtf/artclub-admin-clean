import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";

import type { PublicArtistArtworkItem, PublicArtistProfilePageData } from "@/lib/types";
import {
  PublicArtistProfileEmbed,
  type ArtistEmbedTrackEventType,
} from "@/components/public-profile/PublicArtistProfileEmbed";

declare global {
  interface Window {
    __artclubArtistEmbedLoaded?: boolean;
    __artclubArtistEmbedTrackKeys?: Set<string>;
    ARTCLUB_ANALYTICS_CONFIG?: {
      endpoint?: string;
      storageKey?: string;
      pageHandle?: string;
      pageUrl?: string;
    };
  }
}

type ArtistEmbedElement = HTMLElement & {
  _artclubArtistEmbedRoot?: Root | null;
  _artclubArtistEmbedMounted?: boolean;
  _artclubArtistEmbedUrlObserver?: MutationObserver | null;
};

const EMBED_TAG_NAME = "artclub-artist-profile-embed";
const VISITOR_STORAGE_FALLBACK_KEY = "artclub_visitor_id";
const TRACKING_SOURCE = "shopify_artist_embed";

function trim(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHandle(value: string | undefined | null) {
  return trim(value).replace(/^\/+|\/+$/g, "");
}

function createVisitorId() {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function getStorageKey() {
  return trim(window.ARTCLUB_ANALYTICS_CONFIG?.storageKey) || VISITOR_STORAGE_FALLBACK_KEY;
}

function getCookie(name: string) {
  const prefix = `${name}=`;
  const parts = document.cookie ? document.cookie.split(";") : [];
  for (const part of parts) {
    const item = part.trim();
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
  }
  return "";
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function getVisitorId() {
  const storageKey = getStorageKey();
  try {
    const stored = window.localStorage?.getItem(storageKey);
    if (stored) return stored;
  } catch {
    // ignore storage failures
  }

  const fromCookie = getCookie(storageKey);
  if (fromCookie) return fromCookie;

  const created = createVisitorId();
  try {
    window.localStorage?.setItem(storageKey, created);
  } catch {
    // ignore storage failures
  }
  setCookie(storageKey, created);
  return created;
}

function getTrackingEndpoint() {
  return trim(window.ARTCLUB_ANALYTICS_CONFIG?.endpoint);
}

function getPagePath() {
  return `${window.location.pathname}${window.location.search}`;
}

function getPageUrl() {
  return trim(window.ARTCLUB_ANALYTICS_CONFIG?.pageUrl) || getPagePath();
}

function getPageHandle() {
  return normalizeHandle(window.ARTCLUB_ANALYTICS_CONFIG?.pageHandle || "");
}

function getTrackKeyStore() {
  if (!window.__artclubArtistEmbedTrackKeys) {
    window.__artclubArtistEmbedTrackKeys = new Set<string>();
  }
  return window.__artclubArtistEmbedTrackKeys;
}

function maybeDedupEvent(key: string) {
  if (!key) return false;
  const store = getTrackKeyStore();
  if (store.has(key)) return true;
  store.add(key);
  return false;
}

function buildArtistEventKey(eventType: ArtistEmbedTrackEventType, meta: {
  canonicalArtistId?: string;
  artistSlug?: string;
  artistMetaobjectId?: string;
  canonicalProductId?: string;
  productKey?: string;
}) {
  if (eventType === "artist_profile_view") {
    return [eventType, trim(meta.artistMetaobjectId), trim(meta.canonicalArtistId), normalizeHandle(meta.artistSlug)].join("|");
  }

  if (eventType === "artwork_impression") {
    return [eventType, trim(meta.canonicalProductId), trim(meta.productKey)].join("|");
  }

  return "";
}

async function sendTrackingEvent(params: {
  eventType: ArtistEmbedTrackEventType;
  artistMetaobjectId?: string;
  profile: PublicArtistProfilePageData;
  artwork?: PublicArtistArtworkItem | null;
}) {
  const endpoint = getTrackingEndpoint();
  if (!endpoint) {
    console.error("ARTCLUB artist embed tracking endpoint missing.");
    return;
  }

  const payload = {
    eventType: params.eventType,
    source: TRACKING_SOURCE,
    path: getPagePath(),
    referrer: trim(document.referrer),
    pageHandle: getPageHandle() || params.profile.slug,
    pageUrl: getPageUrl(),
    canonicalArtistId: params.profile.canonicalArtistId,
    artistSlug: params.profile.slug,
    artistMetaobjectId: trim(params.artistMetaobjectId),
    artistName: params.profile.displayName,
    canonicalProductId: trim(params.artwork?.canonicalProductId),
    productKey: trim(params.artwork?.productKey),
    shopifyProductId: trim(params.artwork?.shopifyProductId),
    productHandle: normalizeHandle(params.artwork?.productHandle),
    timestamp: Date.now(),
    visitorId: getVisitorId(),
  };

  const dedupKey = buildArtistEventKey(params.eventType, {
    canonicalArtistId: payload.canonicalArtistId,
    artistSlug: payload.artistSlug,
    artistMetaobjectId: payload.artistMetaobjectId,
    canonicalProductId: payload.canonicalProductId,
    productKey: payload.productKey,
  });
  if (maybeDedupEvent(dedupKey)) return;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    } catch {
      // fall through to fetch
    }
  }

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    });
  } catch (error) {
    console.error("ARTCLUB artist embed tracking failed.", error);
  }
}

function extractAppOrigin(appUrl: string) {
  return new URL(appUrl).origin;
}

function isExternalUrl(value: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

function absolutizeUrl(value: string | undefined | null, appUrl: string) {
  const raw = trim(value);
  if (!raw || raw.startsWith("#") || isExternalUrl(raw) || /^(?:data:|blob:)/i.test(raw)) return raw;

  try {
    if (raw.startsWith("/")) {
      return new URL(raw, extractAppOrigin(appUrl)).toString();
    }
    return new URL(raw, appUrl).toString();
  } catch {
    return raw;
  }
}

function absolutizeSrcset(value: string | undefined | null, appUrl: string) {
  const raw = trim(value);
  if (!raw) return raw;

  return raw
    .split(",")
    .map((candidate) => {
      const parts = trim(candidate).split(/\s+/);
      if (!parts[0]) return "";
      parts[0] = absolutizeUrl(parts[0], appUrl);
      return parts.join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function rewriteCssUrls(value: string | undefined | null, appUrl: string) {
  return String(value || "").replace(/url\(([^)]+)\)/g, (match, rawValue) => {
    const cleaned = trim(String(rawValue || "").replace(/^['"]|['"]$/g, ""));
    if (!cleaned) return match;
    const absolute = absolutizeUrl(cleaned, appUrl);
    return absolute ? `url("${absolute.replace(/"/g, '\\"')}")` : match;
  });
}

function absolutizeNodeUrls(root: ParentNode, appUrl: string) {
  root.querySelectorAll("img[src], source[src], video[src], video[poster]").forEach((node) => {
    if (node instanceof HTMLImageElement || node instanceof HTMLSourceElement || node instanceof HTMLVideoElement) {
      const src = node.getAttribute("src");
      if (src) node.setAttribute("src", absolutizeUrl(src, appUrl));
    }

    if (node instanceof HTMLVideoElement) {
      const poster = node.getAttribute("poster");
      if (poster) node.setAttribute("poster", absolutizeUrl(poster, appUrl));
    }
  });

  root.querySelectorAll("img[srcset], source[srcset]").forEach((node) => {
    const srcset = node.getAttribute("srcset");
    if (srcset) node.setAttribute("srcset", absolutizeSrcset(srcset, appUrl));
  });

  root.querySelectorAll("a[href]").forEach((node) => {
    const href = node.getAttribute("href");
    if (!href) return;
    node.setAttribute("href", absolutizeUrl(href, appUrl));
  });

  root.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
    const style = node.getAttribute("style");
    if (!style || !style.includes("url(")) return;
    node.setAttribute("style", rewriteCssUrls(style, appUrl));
  });
}

function normalizeProfileUrls(profile: PublicArtistProfilePageData, appUrl: string): PublicArtistProfilePageData {
  return {
    ...profile,
    avatarUrl: absolutizeUrl(profile.avatarUrl, appUrl),
    heroUrl: absolutizeUrl(profile.heroUrl, appUrl),
    socialLinks: profile.socialLinks.map((item) => ({
      ...item,
      url: absolutizeUrl(item.url, appUrl),
    })),
    links: profile.links.map((item) => ({
      ...item,
      url: absolutizeUrl(item.url, appUrl),
    })),
    artworks: profile.artworks.map((artwork) => ({
      ...artwork,
      imageUrl: absolutizeUrl(artwork.imageUrl, appUrl),
      galleryUrls: artwork.galleryUrls.map((url) => absolutizeUrl(url, appUrl)),
      shopifyProductUrl: absolutizeUrl(artwork.shopifyProductUrl, appUrl),
    })),
    upcomingExhibitions: profile.upcomingExhibitions.map((item) => ({
      ...item,
      coverImageUrl: absolutizeUrl(item.coverImageUrl, appUrl),
    })),
    exhibitionHistory: profile.exhibitionHistory.map((item) => ({
      ...item,
      coverImageUrl: absolutizeUrl(item.coverImageUrl, appUrl),
    })),
    education: profile.education.map((item) => ({
      ...item,
      imageUrl: absolutizeUrl(item.imageUrl, appUrl),
    })),
    experience: profile.experience.map((item) => ({
      ...item,
      imageUrl: absolutizeUrl(item.imageUrl, appUrl),
    })),
  };
}

function attachUrlRewriteObserver(element: ArtistEmbedElement, root: HTMLElement, appUrl: string) {
  element._artclubArtistEmbedUrlObserver?.disconnect();
  absolutizeNodeUrls(root, appUrl);

  if (typeof window.MutationObserver !== "function") return;

  const observer = new window.MutationObserver(() => {
    absolutizeNodeUrls(root, appUrl);
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "poster", "href", "style"],
  });

  element._artclubArtistEmbedUrlObserver = observer;
}

function extractArtistSlug(appUrl: string) {
  const url = new URL(appUrl);
  const match = url.pathname.match(/\/artist\/([^/?#]+)/i);
  return normalizeHandle(match?.[1] ? decodeURIComponent(match[1]) : "");
}

async function loadProfile(appUrl: string) {
  const slug = extractArtistSlug(appUrl);
  if (!slug) throw new Error("artist_embed_invalid_app_url");

  const apiUrl = new URL(`/api/public/artist-profile/${encodeURIComponent(slug)}`, extractAppOrigin(appUrl));
  const response = await fetch(apiUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
    mode: "cors",
  });

  if (!response.ok) {
    throw new Error(`artist_embed_profile_fetch_failed:${response.status}`);
  }

  return (await response.json()) as PublicArtistProfilePageData;
}

function createShadowMount(element: ArtistEmbedElement, appUrl: string) {
  const root = element.shadowRoot || element.attachShadow({ mode: "open" });
  root.replaceChildren();

  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = `${extractAppOrigin(appUrl)}/artist-embed.css`;
  styleLink.crossOrigin = "anonymous";

  const mount = document.createElement("div");
  mount.setAttribute("data-artclub-artist-embed-mount", "true");

  root.append(styleLink, mount);
  return mount;
}

function updateWrapperDataset(wrapper: HTMLElement, profile: PublicArtistProfilePageData) {
  wrapper.dataset.artclubSource = TRACKING_SOURCE;
  wrapper.dataset.artclubArtistId = profile.canonicalArtistId;
  wrapper.dataset.artclubArtistSlug = profile.slug;
  wrapper.dataset.artclubArtistName = profile.displayName;
  wrapper.dataset.artclubPageHandle = getPageHandle() || profile.slug;
  wrapper.dataset.artclubPageUrl = getPageUrl();
}

class ArtclubArtistProfileEmbedElement extends HTMLElement {
  connectedCallback() {
    if ((this as ArtistEmbedElement)._artclubArtistEmbedMounted) return;
    (this as ArtistEmbedElement)._artclubArtistEmbedMounted = true;
    void this.mountEmbed();
  }

  disconnectedCallback() {
    const self = this as ArtistEmbedElement;
    self._artclubArtistEmbedUrlObserver?.disconnect();
    self._artclubArtistEmbedUrlObserver = null;
    self._artclubArtistEmbedRoot?.unmount();
    self._artclubArtistEmbedRoot = null;
    self._artclubArtistEmbedMounted = false;
  }

  async mountEmbed() {
    const appUrl = trim(this.getAttribute("app-url"));
    const artistMetaobjectId = trim(this.getAttribute("artist-metaobject-id"));
    const wrapper = this.parentElement instanceof HTMLElement ? this.parentElement : null;

    if (!appUrl || !wrapper) {
      console.error("ARTCLUB artist embed missing app_url or wrapper.");
      return;
    }

    try {
      const mount = createShadowMount(this as ArtistEmbedElement, appUrl);
      const profile = normalizeProfileUrls(await loadProfile(appUrl), appUrl);
      updateWrapperDataset(wrapper, profile);
      attachUrlRewriteObserver(this as ArtistEmbedElement, mount, appUrl);

      const reactRoot = createRoot(mount);
      (this as ArtistEmbedElement)._artclubArtistEmbedRoot = reactRoot;

      reactRoot.render(
        createElement(PublicArtistProfileEmbed, {
          profile,
          trackingSource: TRACKING_SOURCE,
          onReady: async () => {
            await sendTrackingEvent({
              eventType: "artist_profile_view",
              artistMetaobjectId,
              profile,
            });
          },
          onTrackEvent: async (eventType: ArtistEmbedTrackEventType, artwork?: PublicArtistArtworkItem | null) => {
            await sendTrackingEvent({
              eventType,
              artistMetaobjectId,
              profile,
              artwork,
            });
          },
        }),
      );
    } catch (error) {
      console.error("ARTCLUB artist embed failed to render.", error);
      this.shadowRoot?.replaceChildren();
    }
  }
}

function boot() {
  if (!window.customElements.get(EMBED_TAG_NAME)) {
    window.customElements.define(EMBED_TAG_NAME, ArtclubArtistProfileEmbedElement);
  }

  document.querySelectorAll<HTMLElement>("[data-artclub-artist-embed]").forEach((wrapper) => {
    const appUrl = trim(wrapper.dataset.artclubAppUrl);
    if (!appUrl) return;
    if (wrapper.querySelector(EMBED_TAG_NAME)) return;

    const element = document.createElement(EMBED_TAG_NAME);
    element.setAttribute("app-url", appUrl);
    if (wrapper.dataset.artclubArtistMetaobjectId) {
      element.setAttribute("artist-metaobject-id", wrapper.dataset.artclubArtistMetaobjectId);
    }
    wrapper.replaceChildren(element);
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (!window.__artclubArtistEmbedLoaded) {
    window.__artclubArtistEmbedLoaded = true;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }
}
