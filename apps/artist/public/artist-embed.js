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

  function getContainerBaseUrl(container) {
    var datasetBase = container && container.dataset ? trim(container.dataset.artclubArtistAppBase || "") : "";
    return datasetBase || defaultBaseUrl;
  }

  function getEmbedHtmlUrl(container) {
    var baseUrl = getContainerBaseUrl(container);
    var slug = normalizeHandle(container && container.dataset ? container.dataset.artclubArtistSlug || "" : "");
    if (!baseUrl || !slug) return "";
    return baseUrl.replace(/\/+$/, "") + "/api/public/artist-embed/" + encodeURIComponent(slug) + "/html";
  }

  function parsePayload(container) {
    var script = container.querySelector("script[data-artclub-artist-embed-payload]");
    if (!script || !script.textContent) return null;

    try {
      return JSON.parse(script.textContent);
    } catch (_error) {
      return null;
    }
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

  function buildModalMarkup(payload, artwork) {
    var title = trim(artwork.title || "Artwork");
    var description = trim(artwork.description || "");
    var price = trim(artwork.priceLabel || "");
    var meta = [artwork.year || "", trim(artwork.seriesName || "")].filter(Boolean).join(" · ");
    var productUrl = trim(artwork.shopifyProductUrl || "");
    var imageUrl = trim(artwork.imageUrl || (Array.isArray(artwork.galleryUrls) ? artwork.galleryUrls[0] || "" : ""));

    return (
      '<div class="fixed inset-0 z-50 bg-black/40 px-4 py-6" data-artclub-embed-modal-overlay="true">' +
      '<div class="mx-auto max-w-3xl rounded-[1.5rem] bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]" ' +
      'data-artclub-source="shopify_artist_embed" ' +
      'data-artclub-artist-id="' + trim(payload.canonicalArtistId || "") + '" ' +
      'data-artclub-artist-slug="' + trim(payload.slug || "") + '" ' +
      'data-artclub-artist-name="' + trim(payload.displayName || "") + '" ' +
      'data-artclub-product-id="' + trim(artwork.canonicalProductId || "") + '" ' +
      'data-artclub-product-key="' + trim(artwork.productKey || "") + '" ' +
      'data-artclub-shopify-product-id="' + trim(artwork.shopifyProductId || "") + '" ' +
      'data-artclub-product-handle="' + trim(artwork.productHandle || "") + '">' +
      '<div class="mb-3 flex justify-end"><button type="button" class="text-sm text-neutral-400" data-artclub-embed-modal-close="true">Close</button></div>' +
      '<div class="space-y-5">' +
      '<div class="overflow-hidden rounded-[1.2rem] bg-neutral-100">' +
      (imageUrl ? '<img src="' + imageUrl + '" alt="' + title.replace(/"/g, "&quot;") + '" class="max-h-[70vh] w-full object-cover">' : "") +
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
          productUrl +
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

  function openArtworkModal(container, artworkIndex) {
    var payload = container.__artclubArtistEmbedPayload;
    var artworks = payload && Array.isArray(payload.artworks) ? payload.artworks : [];
    var artwork = artworks[artworkIndex];
    if (!payload || !artwork) return;

    closeModal(container);

    var modal = document.createElement("div");
    modal.setAttribute("data-artclub-embed-modal", "true");
    modal.innerHTML = buildModalMarkup(payload, artwork);
    container.appendChild(modal);

    document.dispatchEvent(
      new CustomEvent("artclub:artist-embed-artwork-view", {
        detail: {
          container: container,
          artwork: artwork,
          artist: payload,
          target: modal.querySelector("[data-artclub-source='shopify_artist_embed']") || modal,
        },
      }),
    );
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
        var artworkIndex = Number(button.getAttribute("data-artclub-embed-artwork-index"));
        if (Number.isNaN(artworkIndex)) return;
        openArtworkModal(container, artworkIndex);
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

  function renderContainer(container, html) {
    container.innerHTML = html;
    var payload = parsePayload(container);
    container.__artclubArtistEmbedPayload = payload;
    attachInteractions(container);
    setActiveTab(container, "artworks");

    if (payload) {
      if (payload.canonicalArtistId) container.dataset.artclubArtistId = payload.canonicalArtistId;
      if (payload.slug) container.dataset.artclubArtistSlug = payload.slug;
      if (payload.displayName) container.dataset.artclubArtistName = payload.displayName;
    }

    document.dispatchEvent(
      new CustomEvent("artclub:artist-embed-rendered", {
        detail: {
          container: container,
          payload: payload,
        },
      }),
    );
  }

  function loadContainer(container) {
    var baseUrl = getContainerBaseUrl(container);
    var htmlUrl = getEmbedHtmlUrl(container);
    if (!baseUrl || !htmlUrl) return;

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
        renderContainer(container, html);
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
