(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__artclubArtistEmbedLoaded) return;
  window.__artclubArtistEmbedLoaded = true;

  var currentScript = document.currentScript;
  var defaultBaseUrl = "";

  if (currentScript && currentScript.src) {
    try {
      defaultBaseUrl = new URL(currentScript.src, window.location.href).origin;
    } catch (_error) {
      defaultBaseUrl = "";
    }
  }

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeHandle(value) {
    return trim(value).replace(/^\/+|\/+$/g, "");
  }

  function ensureStylesheet(baseUrl) {
    var normalizedBaseUrl = trim(baseUrl || defaultBaseUrl || "").replace(/\/+$/, "");
    if (!normalizedBaseUrl) return;

    var href = normalizedBaseUrl + "/artist-embed.css";
    if (document.querySelector('link[data-artclub-artist-embed-css="' + href + '"]')) return;

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-artclub-artist-embed-css", href);
    document.head.appendChild(link);
  }

  function getContainerAppUrl(container) {
    return container && container.dataset ? trim(container.dataset.artclubAppUrl || "") : "";
  }

  function getEmbedHtmlUrl(container) {
    var appUrl = getContainerAppUrl(container);
    if (!appUrl) return "";

    try {
      return new URL(appUrl, window.location.href).toString();
    } catch (_error) {
      return "";
    }
  }

  function getEmbedAssetBaseUrl(container) {
    var appUrl = getContainerAppUrl(container);
    if (appUrl) {
      try {
        return new URL(appUrl, window.location.href).origin;
      } catch (_error) {
        void 0;
      }
    }

    return defaultBaseUrl;
  }

  function parseHtmlDocument(html) {
    try {
      return new window.DOMParser().parseFromString(html, "text/html");
    } catch (_error) {
      return null;
    }
  }

  function absolutizeEmbeddedUrls(container, baseUrl) {
    if (!container || !baseUrl) return;

    container.querySelectorAll("[src]").forEach(function (node) {
      var value = trim(node.getAttribute("src") || "");
      if (!value) return;
      try {
        node.setAttribute("src", new URL(value, baseUrl).toString());
      } catch (_error) {
        void 0;
      }
    });

    container.querySelectorAll("[href]").forEach(function (node) {
      var value = trim(node.getAttribute("href") || "");
      if (!value || value.charAt(0) === "#") return;
      if (/^(mailto:|tel:|javascript:)/i.test(value)) return;
      try {
        node.setAttribute("href", new URL(value, baseUrl).toString());
      } catch (_error) {
        void 0;
      }
    });
  }

  function extractEmbedMarkup(doc) {
    if (!doc) return "";

    var shell = doc.querySelector("[data-artclub-public-shell='true']");
    if (shell) return shell.outerHTML;

    var artistView = doc.querySelector("[data-artclub-public-artist-view='true']");
    if (artistView) return artistView.outerHTML;

    return doc.body ? doc.body.innerHTML : "";
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

  function readArtistData(container, appUrl) {
    var view = container.querySelector("[data-artclub-public-artist-view='true']");
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

  function setActiveTab(container, nextTab) {
    var tab = normalizeHandle(nextTab);
    if (!tab) return;

    container.querySelectorAll("[data-artclub-embed-tab]").forEach(function (button) {
      var isActive = button.getAttribute("data-artclub-embed-tab") === tab;
      button.setAttribute("data-artclub-embed-tab-active", isActive ? "true" : "false");
      button.classList.toggle("text-neutral-950", isActive);
      button.classList.toggle("text-neutral-400", !isActive);
    });

    container.querySelectorAll("[data-artclub-embed-panel]").forEach(function (panel) {
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
          '" target="_top" rel="noreferrer" class="inline-flex rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium tracking-[-0.01em] text-neutral-950" data-artclub-track-click="shopify_product">View on ARTCLUB</a>'
        : "") +
      "</div></div></div></div>"
    );
  }

  function closeModal(container) {
    var modal = container.querySelector("[data-artclub-embed-modal='true']");
    if (!modal) return;
    modal.remove();
  }

  function openArtworkModal(container, trigger) {
    var artwork = readArtworkDataFromCard(trigger);
    var artist = readArtistData(container, getContainerAppUrl(container));
    if (!artwork) return;

    closeModal(container);

    var modal = document.createElement("div");
    modal.setAttribute("data-artclub-embed-modal", "true");
    modal.innerHTML = buildModalMarkup(artist, artwork);
    container.appendChild(modal);

    document.dispatchEvent(
      new CustomEvent("artclub:artist-embed-artwork-view", {
        detail: {
          container: container,
          artwork: artwork,
          artist: artist,
          target: modal.querySelector("[data-artclub-source='shopify_artist_embed']") || modal,
        },
      })
    );
  }

  function applyTrackingAttributes(container, artist) {
    container.dataset.artclubSource = "shopify_artist_embed";
    if (artist.canonicalArtistId) container.dataset.artclubArtistId = artist.canonicalArtistId;
    if (artist.slug) container.dataset.artclubArtistSlug = artist.slug;
    if (artist.displayName) container.dataset.artclubArtistName = artist.displayName;

    container.querySelectorAll("[data-artclub-artwork-card='true']").forEach(function (card) {
      card.setAttribute("data-artclub-track-impression", "artwork");
      card.setAttribute("data-artclub-track-click", "artwork");
      card.setAttribute("data-artclub-source", "shopify_artist_embed");
      if (artist.canonicalArtistId) card.setAttribute("data-artclub-artist-id", artist.canonicalArtistId);
      if (artist.slug) card.setAttribute("data-artclub-artist-slug", artist.slug);
      if (artist.displayName) card.setAttribute("data-artclub-artist-name", artist.displayName);
    });

    container.querySelectorAll("a[href*='/products/']").forEach(function (link) {
      link.setAttribute("data-artclub-track-click", "shopify_product");
      link.setAttribute("data-artclub-source", "shopify_artist_embed");
      if (artist.canonicalArtistId) link.setAttribute("data-artclub-artist-id", artist.canonicalArtistId);
      if (artist.slug) link.setAttribute("data-artclub-artist-slug", artist.slug);
      if (artist.displayName) link.setAttribute("data-artclub-artist-name", artist.displayName);
    });
  }

  function attachInteractions(container) {
    container.querySelectorAll("[data-artclub-embed-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        var tab = button.getAttribute("data-artclub-embed-tab") || "";
        setActiveTab(container, tab);
      });
    });

    container.querySelectorAll("[data-artclub-embed-artwork-index]").forEach(function (button) {
      button.addEventListener("click", function () {
        openArtworkModal(container, button);
      });
    });

    container.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      if (target.closest("[data-artclub-embed-modal-close='true']")) {
        closeModal(container);
        return;
      }

      var overlay = target.closest("[data-artclub-embed-modal-overlay='true']");
      var dialog = target.closest("[data-artclub-source='shopify_artist_embed']");
      if (overlay && !dialog) {
        closeModal(container);
      }
    });
  }

  function renderContainer(container, html, appUrl) {
    var doc = parseHtmlDocument(html);
    var markup = extractEmbedMarkup(doc);
    if (!markup) throw new Error("artist_embed_markup_missing");

    container.innerHTML = markup;
    absolutizeEmbeddedUrls(container, appUrl);

    var artist = readArtistData(container, appUrl);
    applyTrackingAttributes(container, artist);
    attachInteractions(container);

    var activeTabButton = container.querySelector("[data-artclub-embed-tab-active='true']");
    var activeTab = activeTabButton ? activeTabButton.getAttribute("data-artclub-embed-tab") || "" : "artworks";
    setActiveTab(container, activeTab || "artworks");

    document.dispatchEvent(
      new CustomEvent("artclub:artist-embed-rendered", {
        detail: {
          container: container,
          payload: artist,
        },
      })
    );
  }

  function loadContainer(container) {
    var appUrl = getContainerAppUrl(container);
    var baseUrl = getEmbedAssetBaseUrl(container);
    var htmlUrl = getEmbedHtmlUrl(container);
    if (!appUrl) {
      container.innerHTML = '<div class="mx-auto max-w-5xl px-3 py-8 text-sm text-neutral-400 sm:px-8">Artist app URL missing.</div>';
      return;
    }
    if (!baseUrl || !htmlUrl) {
      container.innerHTML = '<div class="mx-auto max-w-5xl px-3 py-8 text-sm text-neutral-400 sm:px-8">Artist profile unavailable.</div>';
      return;
    }

    ensureStylesheet(baseUrl);
    container.innerHTML = '<div class="mx-auto max-w-5xl px-3 py-8 text-sm text-neutral-400 sm:px-8">Loading artist profile…</div>';

    fetch(htmlUrl, {
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
        renderContainer(container, html, htmlUrl);
      })
      .catch(function () {
        container.innerHTML = '<div class="mx-auto max-w-5xl px-3 py-8 text-sm text-neutral-400 sm:px-8">Artist profile unavailable.</div>';
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
