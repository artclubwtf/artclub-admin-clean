(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__artclubAnalyticsLoaded) return;
  window.__artclubAnalyticsLoaded = true;

  var config = window.ARTCLUB_ANALYTICS_CONFIG || {};
  var storageKey = config.storageKey || "artclub_visitor_id";
  var endpoint = typeof config.endpoint === "string" ? config.endpoint.trim() : "";
  var sentImpressions = new WeakSet();
  var sentEventKeys = new Set();
  var artistEmbedStates = {};

  if (!endpoint) return;

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizePath(value) {
    var input = trim(value);
    if (!input) return window.location.pathname + window.location.search;
    try {
      var url = new URL(input, window.location.origin);
      return url.pathname + url.search;
    } catch (_error) {
      return input;
    }
  }

  function normalizeHandle(value) {
    return trim(value).replace(/^\/+|\/+$/g, "");
  }

  function normalizePageUrl(value) {
    return normalizePath(value);
  }

  function getCookie(name) {
    var prefix = name + "=";
    var parts = document.cookie ? document.cookie.split(";") : [];
    for (var index = 0; index < parts.length; index += 1) {
      var item = parts[index].trim();
      if (item.indexOf(prefix) === 0) return decodeURIComponent(item.slice(prefix.length));
    }
    return "";
  }

  function setCookie(name, value) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=31536000; SameSite=Lax";
  }

  function createVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "v-" + String(Date.now()) + "-" + String(Math.floor(Math.random() * 1000000000));
  }

  function getVisitorId() {
    try {
      var fromStorage = window.localStorage ? window.localStorage.getItem(storageKey) : "";
      if (fromStorage) return fromStorage;
    } catch (_error) {
      void 0;
    }

    var fromCookie = getCookie(storageKey);
    if (fromCookie) return fromCookie;

    var created = createVisitorId();
    try {
      if (window.localStorage) window.localStorage.setItem(storageKey, created);
    } catch (_error2) {
      void 0;
    }
    setCookie(storageKey, created);
    return created;
  }

  function collectJsonLdProduct() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var index = 0; index < scripts.length; index += 1) {
      var node = scripts[index];
      var text = trim(node.textContent || "");
      if (!text) continue;
      try {
        var parsed = JSON.parse(text);
        var candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (var j = 0; j < candidates.length; j += 1) {
          var item = candidates[j];
          if (!item || item["@type"] !== "Product") continue;
          return {
            shopifyProductId: trim(item.productID || item.sku || ""),
            productHandle: normalizeHandle(item.url ? new URL(item.url, window.location.origin).pathname.split("/products/")[1] || "" : ""),
          };
        }
      } catch (_error3) {
        void 0;
      }
    }
    return null;
  }

  function pageContext() {
    var path = normalizePath(window.location.pathname + window.location.search);
    var artistSlugMatch = path.match(/\/(?:pages\/kuenstler|artist)\/([^/?#]+)/i);
    var productHandleMatch = path.match(/\/products\/([^/?#]+)/i);
    var jsonLdProduct = collectJsonLdProduct();

    return {
      path: path,
      referrer: trim(document.referrer || ""),
      pageHandle: normalizeHandle(config.pageHandle || ""),
      pageUrl: normalizePageUrl(config.pageUrl || path),
      canonicalArtistId: trim(config.canonicalArtistId || ""),
      artistSlug: normalizeHandle(config.artistSlug || (artistSlugMatch ? decodeURIComponent(artistSlugMatch[1]) : "")),
      artistMetaobjectId: trim(config.artistMetaobjectId || ""),
      artistName: trim(config.artistName || ""),
      canonicalProductId: trim(config.canonicalProductId || ""),
      productKey: trim(config.productKey || ""),
      shopifyProductId: trim(config.shopifyProductId || (jsonLdProduct && jsonLdProduct.shopifyProductId) || ""),
      productHandle: normalizeHandle(config.productHandle || (productHandleMatch ? decodeURIComponent(productHandleMatch[1]) : "") || (jsonLdProduct && jsonLdProduct.productHandle) || ""),
      visitorId: getVisitorId(),
    };
  }

  function readDataset(target) {
    if (!target || !target.dataset) return {};
    return {
      source: trim(target.dataset.artclubSource || ""),
      embedKey: trim(target.dataset.artclubEmbedKey || ""),
      pageHandle: normalizeHandle(target.dataset.artclubPageHandle || ""),
      pageUrl: normalizePageUrl(target.dataset.artclubPageUrl || ""),
      canonicalArtistId: trim(target.dataset.artclubArtistId || ""),
      artistSlug: normalizeHandle(target.dataset.artclubArtistSlug || ""),
      artistMetaobjectId: trim(target.dataset.artclubArtistMetaobjectId || ""),
      artistName: trim(target.dataset.artclubArtistName || ""),
      canonicalProductId: trim(target.dataset.artclubProductId || ""),
      productKey: trim(target.dataset.artclubProductKey || ""),
      shopifyProductId: trim(target.dataset.artclubShopifyProductId || ""),
      productHandle: normalizeHandle(target.dataset.artclubProductHandle || ""),
    };
  }

  function getClosestTrackElement(node) {
    if (!node || !node.closest) return null;
    return (
      node.closest("[data-artclub-track-view]") ||
      node.closest("[data-artclub-track-impression]") ||
      node.closest("[data-artclub-track-click]") ||
      node.closest(
        "[data-artclub-source], [data-artclub-embed-key], [data-artclub-page-handle], [data-artclub-page-url], [data-artclub-artist-id], [data-artclub-artist-slug], [data-artclub-artist-metaobject-id], [data-artclub-artist-name], [data-artclub-product-id], [data-artclub-product-key], [data-artclub-product-handle]"
      )
    );
  }

  function payloadForEvent(eventType, sourceNode, overrides) {
    overrides = overrides || {};

    var base = pageContext();
    var element = getClosestTrackElement(sourceNode);
    var data = readDataset(element);
    var payload = {
      eventType: eventType,
      source: trim(overrides.source || data.source || config.source || "shopify"),
      path: base.path,
      referrer: base.referrer,
      pageHandle: data.pageHandle || base.pageHandle || undefined,
      pageUrl: data.pageUrl || base.pageUrl || undefined,
      canonicalArtistId: data.canonicalArtistId || base.canonicalArtistId || undefined,
      artistSlug: data.artistSlug || base.artistSlug || undefined,
      artistMetaobjectId: data.artistMetaobjectId || base.artistMetaobjectId || undefined,
      artistName: data.artistName || base.artistName || undefined,
      canonicalProductId: data.canonicalProductId || base.canonicalProductId || undefined,
      productKey: data.productKey || base.productKey || undefined,
      shopifyProductId: data.shopifyProductId || base.shopifyProductId || undefined,
      productHandle: data.productHandle || base.productHandle || undefined,
      timestamp: Date.now(),
      visitorId: base.visitorId,
    };

    if (!payload.productHandle && sourceNode && sourceNode.getAttribute) {
      var href = trim(sourceNode.getAttribute("href") || "");
      var match = href.match(/\/products\/([^/?#]+)/i);
      if (match && match[1]) payload.productHandle = normalizeHandle(decodeURIComponent(match[1]));
    }

    return payload;
  }

  function buildEventDedupKey(payload) {
    if (!payload || (payload.eventType !== "artist_profile_view" && payload.eventType !== "artist_profile_impression")) return "";
    var artistKey = trim(payload.artistMetaobjectId || payload.canonicalArtistId || payload.artistSlug || payload.pageHandle || payload.pageUrl || payload.path);
    if (!artistKey) return "";
    return payload.eventType + "|" + artistKey;
  }

  function sendGaEvent(payload) {
    if (typeof window.gtag !== "function") return;
    if (!payload || !payload.eventType) return;
    window.gtag("event", payload.eventType, {
      artist_slug: payload.artistSlug,
      artwork_handle: payload.productHandle,
      shopify_product_id: payload.shopifyProductId,
    });
  }

  function sendPayload(payload) {
    var dedupKey = buildEventDedupKey(payload);
    if (dedupKey) {
      if (sentEventKeys.has(dedupKey)) return false;
      sentEventKeys.add(dedupKey);
    }

    var body = JSON.stringify(payload);
    sendGaEvent(payload);

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return true;
      } catch (_error4) {
        void 0;
      }
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    }).catch(function () {
      return null;
    });

    return true;
  }

  function getArtistEmbedStateKey(target, iframe) {
    var targetData = readDataset(target);
    var iframeKey = iframe ? trim(iframe.getAttribute("data-artclub-embed-key") || "") : "";
    return targetData.embedKey || iframeKey || "";
  }

  function clearArtistEmbedFallback(state) {
    if (!state || !state.fallbackTimer) return;
    window.clearTimeout(state.fallbackTimer);
    state.fallbackTimer = 0;
  }

  function sendArtistEmbedFallbackView(state) {
    if (!state || state.handled) return;
    var didSend = sendPayload(payloadForEvent("artist_profile_view", state.target, { source: "shopify_artist_embed" }));
    if (didSend) state.handled = true;
  }

  function markArtistEmbedHandled(embedKey) {
    if (!embedKey) return;
    var state = artistEmbedStates[embedKey];
    if (!state) return;
    state.handled = true;
    clearArtistEmbedFallback(state);
  }

  function registerArtistEmbedView(target) {
    var iframe = target.querySelector("iframe[data-artclub-artist-embed='true']") || target.querySelector("iframe");
    if (!iframe) {
      sendPayload(payloadForEvent("artist_profile_view", target));
      return;
    }

    var embedKey = getArtistEmbedStateKey(target, iframe);
    if (!embedKey) {
      sendPayload(payloadForEvent("artist_profile_view", target, { source: "shopify_artist_embed" }));
      return;
    }
    if (artistEmbedStates[embedKey]) return;

    var state = {
      target: target,
      iframe: iframe,
      embedKey: embedKey,
      handled: false,
      fallbackTimer: 0,
    };
    artistEmbedStates[embedKey] = state;

    iframe.addEventListener("load", function () {
      if (state.handled) return;
      clearArtistEmbedFallback(state);
      state.fallbackTimer = window.setTimeout(function () {
        sendArtistEmbedFallbackView(state);
      }, 1500);
    });
  }

  function trackExplicitArtistViews() {
    var artistTargets = document.querySelectorAll("[data-artclub-track-view='artist']");
    if (!artistTargets.length) return false;

    artistTargets.forEach(function (target) {
      var iframe = target.querySelector("iframe[data-artclub-artist-embed='true']");
      if (iframe) {
        registerArtistEmbedView(target);
        return;
      }
      sendPayload(payloadForEvent("artist_profile_view", target));
    });

    return true;
  }

  function trackPageViews() {
    var context = pageContext();
    var artworkTarget = document.querySelector("[data-artclub-track-impression='artwork']");
    var hasExplicitArtistView = trackExplicitArtistViews();

    if (!hasExplicitArtistView) {
      var artistTarget = document.querySelector("[data-artclub-track-impression='artist']");
      if (artistTarget) {
        sendPayload(payloadForEvent("artist_profile_view", artistTarget));
      } else if (/^\/(?:pages\/kuenstler|artist)\//i.test(context.path)) {
        sendPayload(payloadForEvent("artist_profile_view", document.body));
      }
    }

    if (/^\/products\//i.test(context.path) && (context.productHandle || artworkTarget)) {
      sendPayload(payloadForEvent("artwork_view", artworkTarget || document.body));
    }
  }

  function setupImpressionTracking() {
    var targets = document.querySelectorAll("[data-artclub-track-impression]");
    if (!targets.length || !window.IntersectionObserver) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          if (sentImpressions.has(entry.target)) return;
          sentImpressions.add(entry.target);

          var impressionType = trim(entry.target.getAttribute("data-artclub-track-impression"));
          if (impressionType === "artist") {
            sendPayload(payloadForEvent("artist_profile_impression", entry.target));
          } else if (impressionType === "artwork") {
            sendPayload(payloadForEvent("artwork_impression", entry.target));
          }
          observer.unobserve(entry.target);
        });
      },
      { threshold: [0.5] }
    );

    targets.forEach(function (target) {
      observer.observe(target);
    });
  }

  function inferClickEvent(target) {
    var explicit = trim(target.getAttribute("data-artclub-track-click") || "");
    if (explicit === "artwork") return "artwork_click";
    if (explicit === "shopify_product") return "shopify_product_click";
    if (target.tagName === "A") {
      var href = trim(target.getAttribute("href") || "");
      if (/\/products\//i.test(href)) {
        var context = pageContext();
        if (/\/(?:pages\/kuenstler|artist)\//i.test(context.path)) return "shopify_product_click";
        return "artwork_click";
      }
    }
    return "";
  }

  function setupClickTracking() {
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target && event.target.closest ? event.target.closest("[data-artclub-track-click], a[href*='/products/']") : null;
        if (!target) return;
        var eventType = inferClickEvent(target);
        if (!eventType) return;
        sendPayload(payloadForEvent(eventType, target));
      },
      { passive: true }
    );
  }

  function setupArtistEmbedMessaging() {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "artclub-artist-analytics" && data.event === "artist_profile_view_handled") {
        markArtistEmbedHandled(trim(data.embedKey || ""));
      }
    });
  }

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  ready(function () {
    setupArtistEmbedMessaging();
    trackPageViews();
    setupImpressionTracking();
    setupClickTracking();
  });
})();
