(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__artclubArtistEmbedLoaded) return;
  window.__artclubArtistEmbedLoaded = true;

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeHandle(value) {
    return trim(value).replace(/^\/+|\/+$/g, "");
  }

  function parseHtmlDocument(html) {
    try {
      return new window.DOMParser().parseFromString(html, "text/html");
    } catch (_error) {
      return null;
    }
  }

  function getContainerAppUrl(container) {
    return container && container.dataset ? trim(container.dataset.artclubAppUrl || "") : "";
  }

  function toAbsoluteUrl(value, baseUrl) {
    var normalized = trim(value);
    if (!normalized) return "";

    try {
      return new URL(normalized, baseUrl).toString();
    } catch (_error) {
      return normalized;
    }
  }

  function absolutizeCssUrls(cssText, baseUrl) {
    return String(cssText || "")
      .replace(/url\(([^)]+)\)/g, function (match, rawValue) {
        var value = trim(String(rawValue || "").replace(/^['"]|['"]$/g, ""));
        if (!value || /^(data:|blob:|https?:|\/\/|#)/i.test(value)) return match;
        return 'url("' + toAbsoluteUrl(value, baseUrl).replace(/"/g, '\\"') + '")';
      })
      .replace(/@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/g, function (match, rawValue) {
        var value = trim(rawValue || "");
        if (!value || /^(data:|blob:|https?:|\/\/)/i.test(value)) return match;
        return match.replace(rawValue, toAbsoluteUrl(value, baseUrl));
      });
  }

  function extractEmbedElement(doc) {
    if (!doc) return null;
    return (
      doc.querySelector("[data-artclub-public-profile='true']") ||
      doc.querySelector("[data-artclub-public-shell='true']") ||
      doc.querySelector("[data-artclub-public-artist-view='true']") ||
      doc.body
    );
  }

  function absolutizeEmbeddedUrls(root, baseUrl) {
    if (!root || !baseUrl) return;

    root.querySelectorAll("[src]").forEach(function (node) {
      var value = trim(node.getAttribute("src") || "");
      if (!value) return;
      node.setAttribute("src", toAbsoluteUrl(value, baseUrl));
    });

    root.querySelectorAll("[srcset]").forEach(function (node) {
      var srcset = trim(node.getAttribute("srcset") || "");
      if (!srcset) return;

      var nextSrcset = srcset
        .split(",")
        .map(function (candidate) {
          var parts = trim(candidate).split(/\s+/);
          if (!parts[0]) return "";
          parts[0] = toAbsoluteUrl(parts[0], baseUrl);
          return parts.join(" ");
        })
        .filter(Boolean)
        .join(", ");

      if (nextSrcset) node.setAttribute("srcset", nextSrcset);
    });

    root.querySelectorAll("[href]").forEach(function (node) {
      var value = trim(node.getAttribute("href") || "");
      if (!value || value.charAt(0) === "#") return;
      if (/^(mailto:|tel:|javascript:)/i.test(value)) return;
      node.setAttribute("href", toAbsoluteUrl(value, baseUrl));
    });
  }

  function createShadowRoot(container) {
    if (!container.attachShadow) return container;
    if (container.shadowRoot) return container.shadowRoot;
    return container.attachShadow({ mode: "open" });
  }

  function clearShadowRoot(root) {
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
  }

  function appendBaseStyles(root) {
    var style = document.createElement("style");
    style.textContent =
      ":host{display:block;color:initial;font:initial}" +
      ".artclub-artist-shadow-page{display:block;min-height:1px;background:#fff;color:#0a0a0a}" +
      ".artclub-artist-shadow-status{margin:0 auto;max-width:80rem;padding:2rem 0.75rem;color:#a3a3a3;font:400 0.875rem/1.5 ui-sans-serif,system-ui,sans-serif}" +
      "@media (min-width:640px){.artclub-artist-shadow-status{padding-left:2rem;padding-right:2rem}}";
    root.appendChild(style);
  }

  function appendHeadStyles(doc, root, baseUrl) {
    if (!doc || !doc.head) return;

    doc.head.querySelectorAll('link[rel="stylesheet"], style').forEach(function (node) {
      if (node.tagName === "LINK") {
        var href = trim(node.getAttribute("href") || "");
        if (!href) return;

        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = toAbsoluteUrl(href, baseUrl);

        var media = trim(node.getAttribute("media") || "");
        if (media) link.media = media;

        root.appendChild(link);
        return;
      }

      var style = document.createElement("style");
      style.textContent = absolutizeCssUrls(node.textContent || "", baseUrl);
      root.appendChild(style);
    });
  }

  function renderStatus(container, message) {
    var root = createShadowRoot(container);
    clearShadowRoot(root);
    appendBaseStyles(root);

    var status = document.createElement("div");
    status.className = "artclub-artist-shadow-status";
    status.textContent = message;
    root.appendChild(status);
  }

  function getSlugFromAppUrl(appUrl) {
    try {
      var pathname = new URL(appUrl, window.location.href).pathname;
      var match = pathname.match(/\/artist\/([^/?#]+)/i);
      return normalizeHandle(match && match[1] ? decodeURIComponent(match[1]) : "");
    } catch (_error) {
      return "";
    }
  }

  function readArtistData(scope, container, appUrl) {
    var view =
      (scope && scope.querySelector && scope.querySelector("[data-artclub-public-profile='true']")) ||
      (scope && scope.querySelector && scope.querySelector("[data-artclub-public-artist-view='true']"));

    return {
      canonicalArtistId: trim((view && view.getAttribute("data-artclub-artist-id")) || container.dataset.artclubArtistId || ""),
      slug: normalizeHandle((view && view.getAttribute("data-artclub-artist-slug")) || container.dataset.artclubArtistSlug || getSlugFromAppUrl(appUrl)),
      displayName: trim((view && view.getAttribute("data-artclub-artist-name")) || container.dataset.artclubArtistName || ""),
    };
  }

  function readArtworkDataFromCard(card) {
    if (!card || !card.dataset) return null;

    return {
      canonicalProductId: trim(card.dataset.artclubProductId || ""),
      productKey: trim(card.dataset.artclubProductKey || ""),
      shopifyProductId: trim(card.dataset.artclubShopifyProductId || ""),
      productHandle: normalizeHandle(card.dataset.artclubProductHandle || ""),
      shopifyProductUrl: trim(card.dataset.artclubShopifyProductUrl || ""),
      title: trim(card.dataset.artclubArtworkTitle || "Artwork"),
      description: trim(card.dataset.artclubArtworkDescription || ""),
      priceLabel: trim(card.dataset.artclubArtworkPriceLabel || ""),
      year: trim(card.dataset.artclubArtworkYear || ""),
      seriesName: trim(card.dataset.artclubArtworkSeriesName || ""),
      detailLabel: trim(card.dataset.artclubArtworkDetailLabel || ""),
      imageUrl: trim(card.dataset.artclubArtworkImageUrl || ""),
    };
  }

  function dispatchDocumentEvent(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function setActiveTab(scope, nextTab) {
    var tab = normalizeHandle(nextTab);
    if (!tab || !scope) return;

    scope.querySelectorAll("[data-artclub-embed-tab]").forEach(function (button) {
      var isActive = button.getAttribute("data-artclub-embed-tab") === tab;
      button.setAttribute("data-artclub-embed-tab-active", isActive ? "true" : "false");
      button.classList.toggle("text-neutral-950", isActive);
      button.classList.toggle("text-neutral-400", !isActive);
    });

    scope.querySelectorAll("[data-artclub-embed-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-artclub-embed-panel") !== tab;
    });
  }

  function buildModalMarkup(artist, artwork) {
    var title = trim(artwork.title || "Artwork");
    var description = trim(artwork.description || "");
    var price = trim(artwork.priceLabel || "");
    var meta = [artwork.year || "", trim(artwork.seriesName || "")].filter(Boolean).join(" · ");
    var productUrl = trim(artwork.shopifyProductUrl || "");
    var imageUrl = trim(artwork.imageUrl || "");

    return (
      '<div class="fixed inset-0 z-50 bg-black/40 px-4 py-6" data-artclub-embed-modal-overlay="true">' +
      '<div class="mx-auto max-w-3xl rounded-[1.5rem] bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]" ' +
      'data-artclub-source="shopify_artist_embed" ' +
      'data-artclub-artist-id="' + trim(artist.canonicalArtistId || "") + '" ' +
      'data-artclub-artist-slug="' + trim(artist.slug || "") + '" ' +
      'data-artclub-artist-name="' + trim(artist.displayName || "") + '" ' +
      'data-artclub-product-id="' + trim(artwork.canonicalProductId || "") + '" ' +
      'data-artclub-product-key="' + trim(artwork.productKey || "") + '" ' +
      'data-artclub-shopify-product-id="' + trim(artwork.shopifyProductId || "") + '" ' +
      'data-artclub-product-handle="' + trim(artwork.productHandle || "") + '">' +
      '<div class="mb-3 flex justify-end"><button type="button" class="text-sm text-neutral-400" data-artclub-embed-modal-close="true">Close</button></div>' +
      '<div class="space-y-5">' +
      '<div class="overflow-hidden rounded-[1.2rem] bg-neutral-100">' +
      (imageUrl ? '<img src="' + imageUrl.replace(/"/g, "&quot;") + '" alt="' + title.replace(/"/g, "&quot;") + '" class="max-h-[70vh] w-full object-cover">' : "") +
      "</div>" +
      '<div class="space-y-2">' +
      '<div class="flex items-start justify-between gap-4"><div><h2 class="text-2xl font-semibold tracking-[-0.03em] text-neutral-950">' +
      title +
      '</h2>' +
      (meta ? '<div class="mt-1 text-sm text-neutral-500">' + meta + "</div>" : "") +
      '</div><div class="text-sm text-neutral-500">' + price + "</div></div>" +
      (description ? '<p class="max-w-2xl text-[0.98rem] leading-7 text-neutral-600">' + description + "</p>" : "") +
      '<div class="flex flex-wrap items-center gap-3">' +
      '<div class="inline-flex rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium tracking-[-0.01em] text-neutral-900">' + trim(artwork.detailLabel || "") + "</div>" +
      (productUrl
        ? '<a href="' +
          productUrl.replace(/"/g, "&quot;") +
          '" target="_top" rel="noreferrer" class="inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium tracking-[-0.01em] text-neutral-950" data-artclub-track-click="shopify_product" data-artclub-source="shopify_artist_embed" data-artclub-artist-id="' +
          trim(artist.canonicalArtistId || "") +
          '" data-artclub-artist-slug="' +
          trim(artist.slug || "") +
          '" data-artclub-artist-name="' +
          trim(artist.displayName || "") +
          '" data-artclub-product-id="' +
          trim(artwork.canonicalProductId || "") +
          '" data-artclub-product-key="' +
          trim(artwork.productKey || "") +
          '" data-artclub-shopify-product-id="' +
          trim(artwork.shopifyProductId || "") +
          '" data-artclub-product-handle="' +
          trim(artwork.productHandle || "") +
          '">View on ARTCLUB</a>'
        : "") +
      "</div></div></div></div>"
    );
  }

  function closeModal(scope) {
    var modal = scope && scope.querySelector ? scope.querySelector("[data-artclub-embed-modal='true']") : null;
    if (modal) modal.remove();
  }

  function openArtworkModal(scope, container, artist, trigger) {
    var artwork = readArtworkDataFromCard(trigger);
    if (!artwork) return;

    closeModal(scope);

    var modal = document.createElement("div");
    modal.setAttribute("data-artclub-embed-modal", "true");
    modal.innerHTML = buildModalMarkup(artist, artwork);
    scope.appendChild(modal);

    dispatchDocumentEvent("artclub:artist-embed-artwork-view", {
      container: container,
      artwork: artwork,
      artist: artist,
      target: modal.querySelector("[data-artclub-source='shopify_artist_embed']") || modal,
    });
  }

  function copyArtworkData(fromNode, toNode) {
    if (!fromNode || !fromNode.dataset || !toNode) return;

    [
      ["artclubProductId", "data-artclub-product-id"],
      ["artclubProductKey", "data-artclub-product-key"],
      ["artclubShopifyProductId", "data-artclub-shopify-product-id"],
      ["artclubProductHandle", "data-artclub-product-handle"],
    ].forEach(function (entry) {
      var datasetKey = entry[0];
      var attr = entry[1];
      var value = trim(fromNode.dataset[datasetKey] || "");
      if (value && !trim(toNode.getAttribute(attr) || "")) {
        toNode.setAttribute(attr, value);
      }
    });
  }

  function applyTrackingAttributes(scope, container, artist) {
    container.dataset.artclubSource = "shopify_artist_embed";
    if (artist.canonicalArtistId) container.dataset.artclubArtistId = artist.canonicalArtistId;
    if (artist.slug) container.dataset.artclubArtistSlug = artist.slug;
    if (artist.displayName) container.dataset.artclubArtistName = artist.displayName;

    scope.querySelectorAll("[data-artclub-artwork-card='true']").forEach(function (card) {
      card.setAttribute("data-artclub-track-impression", "artwork");
      card.setAttribute("data-artclub-track-click", "artwork");
      card.setAttribute("data-artclub-source", "shopify_artist_embed");
      if (artist.canonicalArtistId) card.setAttribute("data-artclub-artist-id", artist.canonicalArtistId);
      if (artist.slug) card.setAttribute("data-artclub-artist-slug", artist.slug);
      if (artist.displayName) card.setAttribute("data-artclub-artist-name", artist.displayName);
    });

    scope.querySelectorAll("a[href*='/products/']").forEach(function (link) {
      link.setAttribute("data-artclub-track-click", "shopify_product");
      link.setAttribute("data-artclub-source", "shopify_artist_embed");
      if (artist.canonicalArtistId) link.setAttribute("data-artclub-artist-id", artist.canonicalArtistId);
      if (artist.slug) link.setAttribute("data-artclub-artist-slug", artist.slug);
      if (artist.displayName) link.setAttribute("data-artclub-artist-name", artist.displayName);
      copyArtworkData(link.closest("[data-artclub-artwork-card='true']"), link);
    });
  }

  function attachArtworkImpressionObserver(scope, container, artist) {
    if (container.__artclubArtworkImpressionObserver) {
      container.__artclubArtworkImpressionObserver.disconnect();
    }
    if (!window.IntersectionObserver || !scope) return;

    var seenProductKeys = new Set();
    var observer = new window.IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;

          var target = entry.target;
          var artwork = readArtworkDataFromCard(target);
          if (!artwork || !artwork.productKey || seenProductKeys.has(artwork.productKey)) return;

          seenProductKeys.add(artwork.productKey);
          observer.unobserve(target);

          dispatchDocumentEvent("artclub:artist-embed-artwork-impression", {
            container: container,
            artwork: artwork,
            artist: artist,
            target: target,
          });
        });
      },
      { threshold: [0.5] }
    );

    scope.querySelectorAll("[data-artclub-artwork-card='true']").forEach(function (card) {
      observer.observe(card);
    });

    container.__artclubArtworkImpressionObserver = observer;
  }

  function attachInteractions(scope, container, artist) {
    scope.querySelectorAll("[data-artclub-embed-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        var tab = button.getAttribute("data-artclub-embed-tab") || "";
        setActiveTab(scope, tab);
      });
    });

    scope.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      if (target.closest("[data-artclub-embed-modal-close='true']")) {
        closeModal(scope);
        return;
      }

      var overlay = target.closest("[data-artclub-embed-modal-overlay='true']");
      var dialog = target.closest("[data-artclub-source='shopify_artist_embed']");
      if (overlay && !dialog) {
        closeModal(scope);
        return;
      }

      var productLink = target.closest("[data-artclub-track-click='shopify_product'], a[href*='/products/']");
      if (productLink) {
        dispatchDocumentEvent("artclub:artist-embed-product-click", {
          container: container,
          artist: artist,
          artwork: {
            canonicalProductId: trim(productLink.getAttribute("data-artclub-product-id") || ""),
            productKey: trim(productLink.getAttribute("data-artclub-product-key") || ""),
            shopifyProductId: trim(productLink.getAttribute("data-artclub-shopify-product-id") || ""),
            productHandle: normalizeHandle(productLink.getAttribute("data-artclub-product-handle") || ""),
          },
          target: productLink,
        });
        return;
      }

      var artworkCard = target.closest("[data-artclub-artwork-card='true']");
      if (artworkCard) {
        dispatchDocumentEvent("artclub:artist-embed-artwork-click", {
          container: container,
          artwork: readArtworkDataFromCard(artworkCard),
          artist: artist,
          target: artworkCard,
        });
        openArtworkModal(scope, container, artist, artworkCard);
      }
    });
  }

  function renderContainer(container, html, appUrl) {
    var doc = parseHtmlDocument(html);
    var embedElement = extractEmbedElement(doc);
    if (!doc || !embedElement) throw new Error("artist_embed_markup_missing");

    var scope = createShadowRoot(container);
    clearShadowRoot(scope);
    appendBaseStyles(scope);
    appendHeadStyles(doc, scope, appUrl);

    var page = document.createElement("div");
    page.className = "artclub-artist-shadow-page " + trim((doc.body && doc.body.className) || "");
    page.setAttribute("data-artclub-shadow-page", "true");

    if (doc.body) {
      var bodyStyle = trim(doc.body.getAttribute("style") || "");
      if (bodyStyle) page.setAttribute("style", bodyStyle);
    }

    var template = document.createElement("template");
    template.innerHTML = embedElement.outerHTML || (doc.body ? doc.body.innerHTML : "");
    var contentRoot = template.content.firstElementChild;
    if (!contentRoot) throw new Error("artist_embed_content_missing");

    absolutizeEmbeddedUrls(contentRoot, appUrl);
    page.appendChild(contentRoot);
    scope.appendChild(page);

    var artist = readArtistData(page, container, appUrl);
    applyTrackingAttributes(page, container, artist);
    attachArtworkImpressionObserver(page, container, artist);
    attachInteractions(page, container, artist);

    var activeTabButton = page.querySelector("[data-artclub-embed-tab-active='true']");
    var activeTab = activeTabButton ? activeTabButton.getAttribute("data-artclub-embed-tab") || "" : "artworks";
    setActiveTab(page, activeTab || "artworks");

    dispatchDocumentEvent("artclub:artist-embed-rendered", {
      container: container,
      payload: artist,
    });
  }

  function loadContainer(container) {
    var appUrl = getContainerAppUrl(container);
    if (!appUrl) {
      renderStatus(container, "Artist app URL missing.");
      return;
    }

    renderStatus(container, "Loading artist profile…");

    fetch(appUrl, {
      method: "GET",
      headers: { Accept: "text/html" },
      credentials: "omit",
      mode: "cors",
    })
      .then(function (response) {
        if (!response.ok) throw new Error("artist_embed_html_failed");
        return response.text();
      })
      .then(function (html) {
        renderContainer(container, html, appUrl);
      })
      .catch(function () {
        renderStatus(container, "Artist profile unavailable.");
      });
  }

  function boot() {
    document.querySelectorAll("[data-artclub-artist-embed]").forEach(function (container) {
      loadContainer(container);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
