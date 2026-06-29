(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__artclubAnalyticsLoaded) return;
  window.__artclubAnalyticsLoaded = true;

  var config = window.ARTCLUB_ANALYTICS_CONFIG || {};
  var storageKey = config.storageKey || "artclub_visitor_id";
  var endpoint = typeof config.endpoint === "string" ? config.endpoint.trim() : "";
  var sentImpressions = new WeakSet();
  var sentEventKeys = new Set();
  var impressionObserver = null;
  var embedStylesInjected = false;
  var modalRoot = null;
  var modalBody = null;

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

  function escapeHtml(value) {
    return trim(String(value)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
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
        "[data-artclub-artist-embed], [data-artclub-source], [data-artclub-page-handle], [data-artclub-page-url], [data-artclub-artist-id], [data-artclub-artist-slug], [data-artclub-artist-metaobject-id], [data-artclub-artist-name], [data-artclub-product-id], [data-artclub-product-key], [data-artclub-shopify-product-id], [data-artclub-product-handle]"
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
      pageHandle: normalizeHandle(overrides.pageHandle || data.pageHandle || base.pageHandle || ""),
      pageUrl: normalizePageUrl(overrides.pageUrl || data.pageUrl || base.pageUrl || ""),
      canonicalArtistId: trim(overrides.canonicalArtistId || data.canonicalArtistId || base.canonicalArtistId || ""),
      artistSlug: normalizeHandle(overrides.artistSlug || data.artistSlug || base.artistSlug || ""),
      artistMetaobjectId: trim(overrides.artistMetaobjectId || data.artistMetaobjectId || base.artistMetaobjectId || ""),
      artistName: trim(overrides.artistName || data.artistName || base.artistName || ""),
      canonicalProductId: trim(overrides.canonicalProductId || data.canonicalProductId || base.canonicalProductId || ""),
      productKey: trim(overrides.productKey || data.productKey || base.productKey || ""),
      shopifyProductId: trim(overrides.shopifyProductId || data.shopifyProductId || base.shopifyProductId || ""),
      productHandle: normalizeHandle(overrides.productHandle || data.productHandle || base.productHandle || ""),
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

  function ensureArtistEmbedStyles() {
    if (embedStylesInjected) return;
    embedStylesInjected = true;

    var style = document.createElement("style");
    style.id = "artclub-artist-embed-styles";
    style.textContent =
      ".artclub-artist-embed{min-height:24rem;}" +
      ".artclub-artist-embed__shell{max-width:1180px;margin:0 auto;padding:1.5rem 0 2rem;color:#111;}" +
      ".artclub-artist-embed__hero{display:grid;gap:1.25rem;align-items:end;}" +
      "@media(min-width:900px){.artclub-artist-embed__hero{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);}}" +
      ".artclub-artist-embed__hero-media{position:relative;overflow:hidden;border-radius:1.35rem;background:#f2f2f2;min-height:20rem;}" +
      ".artclub-artist-embed__hero-media img{display:block;width:100%;height:100%;object-fit:cover;}" +
      ".artclub-artist-embed__hero-copy{display:flex;flex-direction:column;gap:1rem;padding:0.25rem 0;}" +
      ".artclub-artist-embed__avatar{width:6rem;height:6rem;border-radius:999px;overflow:hidden;background:#f2f2f2;border:4px solid #fff;box-shadow:0 12px 28px rgba(0,0,0,.08);}" +
      ".artclub-artist-embed__avatar img{display:block;width:100%;height:100%;object-fit:cover;}" +
      ".artclub-artist-embed__eyebrow{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:#6b6b6b;}" +
      ".artclub-artist-embed__title{margin:0;font-size:clamp(2rem,4vw,3.6rem);line-height:.96;font-weight:700;letter-spacing:-.04em;}" +
      ".artclub-artist-embed__bio,.artclub-artist-embed__longtext{margin:0;max-width:58ch;font-size:1rem;line-height:1.75;color:#505050;}" +
      ".artclub-artist-embed__quote{margin:0;padding:1rem 1.1rem;border-left:3px solid #111;background:#f8f8f8;border-radius:.8rem;font-size:.98rem;line-height:1.7;color:#333;}" +
      ".artclub-artist-embed__links{display:flex;flex-wrap:wrap;gap:.65rem;}" +
      ".artclub-artist-embed__link{display:inline-flex;align-items:center;gap:.45rem;padding:.7rem 1rem;border:1px solid #dedede;border-radius:999px;color:#111;text-decoration:none;font-size:.92rem;background:#fff;}" +
      ".artclub-artist-embed__section{margin-top:2.5rem;}" +
      ".artclub-artist-embed__section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem;}" +
      ".artclub-artist-embed__section-title{margin:0;font-size:1.45rem;line-height:1.1;font-weight:700;letter-spacing:-.03em;}" +
      ".artclub-artist-embed__section-copy{margin:0;font-size:.95rem;color:#6b6b6b;}" +
      ".artclub-artist-embed__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;}" +
      "@media(min-width:900px){.artclub-artist-embed__grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:1.35rem;}}" +
      ".artclub-artist-embed__card{display:flex;flex-direction:column;gap:.8rem;}" +
      ".artclub-artist-embed__card-hit{display:block;padding:0;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit;}" +
      ".artclub-artist-embed__card-media{position:relative;overflow:hidden;border-radius:.8rem;background:#f3f3f3;}" +
      ".artclub-artist-embed__card-media img{display:block;width:100%;aspect-ratio:.78;object-fit:cover;transition:transform .25s ease;}" +
      ".artclub-artist-embed__card-hit:hover .artclub-artist-embed__card-media img{transform:scale(1.02);}" +
      ".artclub-artist-embed__card-badge{position:absolute;right:.8rem;bottom:.8rem;display:inline-flex;padding:.45rem .7rem;border-radius:999px;background:rgba(255,255,255,.92);font-size:.72rem;font-weight:600;letter-spacing:-.01em;}" +
      ".artclub-artist-embed__card-title{margin:0;font-size:1rem;font-weight:700;letter-spacing:-.02em;}" +
      ".artclub-artist-embed__card-meta,.artclub-artist-embed__card-price{margin:0;font-size:.9rem;color:#666;}" +
      ".artclub-artist-embed__card-actions{display:flex;flex-wrap:wrap;gap:.55rem;}" +
      ".artclub-artist-embed__button{display:inline-flex;align-items:center;justify-content:center;padding:.72rem 1rem;border-radius:999px;border:1px solid #ddd;background:#fff;color:#111;text-decoration:none;font-size:.9rem;font-weight:600;}" +
      ".artclub-artist-embed__button--primary{background:#111;border-color:#111;color:#fff;}" +
      ".artclub-artist-embed__empty,.artclub-artist-embed__error,.artclub-artist-embed__loading{padding:1.25rem;border-radius:1rem;background:#f7f7f7;color:#555;font-size:.96rem;line-height:1.6;}" +
      ".artclub-artist-embed__loading{min-height:18rem;display:flex;align-items:center;justify-content:center;}" +
      ".artclub-artist-embed__modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:1.5rem;background:rgba(15,15,15,.52);}" +
      ".artclub-artist-embed__modal.is-open{display:flex;}" +
      ".artclub-artist-embed__modal-dialog{width:min(980px,100%);max-height:calc(100vh - 3rem);overflow:auto;border-radius:1.25rem;background:#fff;padding:1rem;box-shadow:0 24px 80px rgba(0,0,0,.18);}" +
      ".artclub-artist-embed__modal-close{display:inline-flex;margin-left:auto;border:0;background:transparent;color:#666;font-size:.92rem;cursor:pointer;}" +
      ".artclub-artist-embed__modal-grid{display:grid;gap:1rem;}" +
      "@media(min-width:900px){.artclub-artist-embed__modal-grid{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:start;}}" +
      ".artclub-artist-embed__modal-media{overflow:hidden;border-radius:1rem;background:#f2f2f2;}" +
      ".artclub-artist-embed__modal-media img{display:block;width:100%;max-height:72vh;object-fit:cover;}" +
      ".artclub-artist-embed__modal-copy{display:flex;flex-direction:column;gap:.9rem;}" +
      ".artclub-artist-embed__modal-copy h3{margin:0;font-size:1.8rem;line-height:1.02;letter-spacing:-.03em;}" +
      ".artclub-artist-embed__modal-copy p{margin:0;color:#555;line-height:1.75;}" +
      ".artclub-artist-embed__modal-meta{font-size:.92rem;color:#666;}" +
      ".artclub-artist-embed__modal-actions{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:.35rem;}";
    document.head.appendChild(style);
  }

  function getEmbedApiUrl(slug) {
    var normalizedSlug = normalizeHandle(slug);
    if (!normalizedSlug) return "";
    try {
      return new URL("/api/public/artist-embed/" + encodeURIComponent(normalizedSlug), endpoint).toString();
    } catch (_error) {
      try {
        return new URL("/api/public/artist-embed/" + encodeURIComponent(normalizedSlug), window.location.origin).toString();
      } catch (_error2) {
        return "";
      }
    }
  }

  function createArtworkCardMarkup(artist, artwork, index) {
    var productUrl = trim(artwork.shopifyProductUrl || "");
    var meta = [artwork.year || "", trim(artwork.seriesName || "")].filter(Boolean).join(" · ");
    var image = trim(artwork.imageUrl || artwork.galleryUrls && artwork.galleryUrls[0] || "");

    return (
      '<article class="artclub-artist-embed__card" data-artclub-track-impression="artwork" data-artclub-source="shopify_artist_embed" data-artclub-artist-id="' +
      escapeHtml(artist.canonicalArtistId) +
      '" data-artclub-artist-slug="' +
      escapeHtml(artist.slug) +
      '" data-artclub-artist-name="' +
      escapeHtml(artist.displayName) +
      '" data-artclub-product-id="' +
      escapeHtml(artwork.canonicalProductId) +
      '" data-artclub-product-key="' +
      escapeHtml(artwork.productKey) +
      '" data-artclub-shopify-product-id="' +
      escapeHtml(artwork.shopifyProductId) +
      '" data-artclub-product-handle="' +
      escapeHtml(artwork.productHandle) +
      '">' +
      '<button type="button" class="artclub-artist-embed__card-hit" data-artclub-track-click="artwork" data-artclub-artwork-open="' +
      escapeHtml(String(index)) +
      '">' +
      '<div class="artclub-artist-embed__card-media">' +
      (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(artwork.title || "Artwork") + '" loading="lazy">' : "") +
      '<span class="artclub-artist-embed__card-badge">More about the artwork</span>' +
      "</div>" +
      '<div class="artclub-artist-embed__card-copy">' +
      '<h3 class="artclub-artist-embed__card-title">' +
      escapeHtml(artwork.title || "Artwork") +
      "</h3>" +
      (meta ? '<p class="artclub-artist-embed__card-meta">' + escapeHtml(meta) + "</p>" : "") +
      (trim(artwork.priceLabel) ? '<p class="artclub-artist-embed__card-price">' + escapeHtml(artwork.priceLabel) + "</p>" : "") +
      "</div>" +
      "</button>" +
      '<div class="artclub-artist-embed__card-actions">' +
      (productUrl
        ? '<a class="artclub-artist-embed__button" data-artclub-track-click="shopify_product" href="' +
          escapeHtml(productUrl) +
          '" target="_top" rel="noreferrer">View on ARTCLUB</a>'
        : "") +
      "</div>" +
      "</article>"
    );
  }

  function createArtistEmbedMarkup(payload) {
    var artist = payload.artist || {};
    var artworks = Array.isArray(payload.artworks) ? payload.artworks : [];
    var links = Array.isArray(artist.socialLinks) && artist.socialLinks.length ? artist.socialLinks : Array.isArray(artist.links) ? artist.links.slice(0, 5) : [];
    var heroImage = trim(artist.heroUrl || artist.avatarUrl || artworks[0] && artworks[0].imageUrl || "");
    var avatarImage = trim(artist.avatarUrl || heroImage);
    var artworkGrid = artworks.map(function (artwork, index) {
      return createArtworkCardMarkup(artist, artwork, index);
    }).join("");

    return (
      '<div class="artclub-artist-embed__shell">' +
      '<section class="artclub-artist-embed__hero">' +
      '<div class="artclub-artist-embed__hero-media">' +
      (heroImage ? '<img src="' + escapeHtml(heroImage) + '" alt="' + escapeHtml(artist.displayName || "Artist") + '" loading="lazy">' : "") +
      "</div>" +
      '<div class="artclub-artist-embed__hero-copy">' +
      '<span class="artclub-artist-embed__eyebrow">ARTCLUB Artist</span>' +
      '<div class="artclub-artist-embed__avatar">' +
      (avatarImage ? '<img src="' + escapeHtml(avatarImage) + '" alt="' + escapeHtml(artist.displayName || "Artist") + '" loading="lazy">' : "") +
      "</div>" +
      '<h1 class="artclub-artist-embed__title">' +
      escapeHtml(artist.displayName || "Artist") +
      "</h1>" +
      (trim(artist.quote) ? '<p class="artclub-artist-embed__quote">' + escapeHtml(artist.quote) + "</p>" : "") +
      (trim(artist.bio) ? '<p class="artclub-artist-embed__bio">' + escapeHtml(artist.bio) + "</p>" : "") +
      (trim(artist.longText) ? '<p class="artclub-artist-embed__longtext">' + escapeHtml(artist.longText) + "</p>" : "") +
      (links.length
        ? '<div class="artclub-artist-embed__links">' +
          links
            .map(function (link) {
              return (
                '<a class="artclub-artist-embed__link" href="' +
                escapeHtml(link.url || "") +
                '" target="_blank" rel="noreferrer">' +
                escapeHtml(link.label || link.type || "Link") +
                "</a>"
              );
            })
            .join("") +
          "</div>"
        : "") +
      "</div>" +
      "</section>" +
      '<section class="artclub-artist-embed__section">' +
      '<div class="artclub-artist-embed__section-head">' +
      '<div><h2 class="artclub-artist-embed__section-title">Artworks</h2>' +
      '<p class="artclub-artist-embed__section-copy">Rendered directly inside the Shopify page.</p></div>' +
      "</div>" +
      (artworkGrid ? '<div class="artclub-artist-embed__grid">' + artworkGrid + "</div>" : '<div class="artclub-artist-embed__empty">No public artworks are available right now.</div>') +
      "</section>" +
      "</div>"
    );
  }

  function ensureModal() {
    if (modalRoot && modalBody) return;

    modalRoot = document.createElement("div");
    modalRoot.className = "artclub-artist-embed__modal";
    modalRoot.innerHTML =
      '<div class="artclub-artist-embed__modal-dialog" role="dialog" aria-modal="true" aria-label="Artwork details">' +
      '<button type="button" class="artclub-artist-embed__modal-close" data-artclub-modal-close="true">Close</button>' +
      '<div class="artclub-artist-embed__modal-body"></div>' +
      "</div>";
    modalBody = modalRoot.querySelector(".artclub-artist-embed__modal-body");

    modalRoot.addEventListener("click", function (event) {
      if (event.target === modalRoot || (event.target && event.target.closest && event.target.closest("[data-artclub-modal-close='true']"))) {
        closeArtworkModal();
      }
    });

    document.body.appendChild(modalRoot);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeArtworkModal();
    });
  }

  function closeArtworkModal() {
    if (!modalRoot || !modalBody) return;
    modalRoot.classList.remove("is-open");
    modalBody.innerHTML = "";
  }

  function openArtworkModal(container, artworkIndex, trigger) {
    var payload = container && container.__artclubArtistEmbedData;
    var artworks = payload && Array.isArray(payload.artworks) ? payload.artworks : [];
    var artwork = artworks[artworkIndex];
    var artist = payload && payload.artist ? payload.artist : {};
    if (!artwork) return;

    ensureModal();
    if (!modalRoot || !modalBody) return;

    var image = trim(artwork.imageUrl || artwork.galleryUrls && artwork.galleryUrls[0] || "");
    var meta = [artwork.year || "", trim(artwork.seriesName || "")].filter(Boolean).join(" · ");
    var productUrl = trim(artwork.shopifyProductUrl || "");

    modalBody.innerHTML =
      '<div class="artclub-artist-embed__modal-grid">' +
      '<div class="artclub-artist-embed__modal-media">' +
      (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(artwork.title || "Artwork") + '">' : "") +
      "</div>" +
      '<div class="artclub-artist-embed__modal-copy" data-artclub-source="shopify_artist_embed" data-artclub-artist-id="' +
      escapeHtml(artist.canonicalArtistId || "") +
      '" data-artclub-artist-slug="' +
      escapeHtml(artist.slug || "") +
      '" data-artclub-artist-name="' +
      escapeHtml(artist.displayName || "") +
      '" data-artclub-product-id="' +
      escapeHtml(artwork.canonicalProductId || "") +
      '" data-artclub-product-key="' +
      escapeHtml(artwork.productKey || "") +
      '" data-artclub-shopify-product-id="' +
      escapeHtml(artwork.shopifyProductId || "") +
      '" data-artclub-product-handle="' +
      escapeHtml(artwork.productHandle || "") +
      '">' +
      '<h3>' +
      escapeHtml(artwork.title || "Artwork") +
      "</h3>" +
      (meta ? '<p class="artclub-artist-embed__modal-meta">' + escapeHtml(meta) + "</p>" : "") +
      (trim(artwork.priceLabel) ? '<p class="artclub-artist-embed__modal-meta">' + escapeHtml(artwork.priceLabel) + "</p>" : "") +
      (trim(artwork.description) ? "<p>" + escapeHtml(artwork.description) + "</p>" : "") +
      '<div class="artclub-artist-embed__modal-actions">' +
      (productUrl
        ? '<a class="artclub-artist-embed__button artclub-artist-embed__button--primary" data-artclub-track-click="shopify_product" href="' +
          escapeHtml(productUrl) +
          '" target="_top" rel="noreferrer">View on ARTCLUB</a>'
        : "") +
      "</div>" +
      "</div>" +
      "</div>";

    modalRoot.classList.add("is-open");
    sendPayload(payloadForEvent("artwork_view", trigger || container, { source: "shopify_artist_embed" }));
  }

  function createImpressionObserver() {
    if (impressionObserver || !window.IntersectionObserver) return impressionObserver;

    impressionObserver = new IntersectionObserver(
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
          impressionObserver.unobserve(entry.target);
        });
      },
      { threshold: [0.5] }
    );

    return impressionObserver;
  }

  function observeImpressionTargets(root) {
    var observer = createImpressionObserver();
    if (!observer) return;
    var scope = root && root.querySelectorAll ? root : document;
    var targets = scope.querySelectorAll("[data-artclub-track-impression]");
    targets.forEach(function (target) {
      if (sentImpressions.has(target)) return;
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

  function setupArtistEmbedInteractions() {
    document.addEventListener("click", function (event) {
      var trigger = event.target && event.target.closest ? event.target.closest("[data-artclub-artwork-open]") : null;
      if (!trigger) return;
      var container = trigger.closest("[data-artclub-artist-embed]");
      if (!container) return;
      var artworkIndex = Number(trigger.getAttribute("data-artclub-artwork-open"));
      if (Number.isNaN(artworkIndex)) return;
      openArtworkModal(container, artworkIndex, trigger);
    });
  }

  function renderArtistEmbed(container, payload) {
    if (!container || !payload || !payload.artist) return false;

    container.dataset.artclubArtistId = trim(payload.artist.canonicalArtistId || "");
    container.dataset.artclubArtistSlug = normalizeHandle(payload.artist.slug || container.dataset.artclubArtistSlug || "");
    container.dataset.artclubArtistName = trim(payload.artist.displayName || container.dataset.artclubArtistName || "");
    if (trim(payload.artist.artistMetaobjectId || "")) {
      container.dataset.artclubArtistMetaobjectId = trim(payload.artist.artistMetaobjectId);
    }

    container.__artclubArtistEmbedData = payload;
    container.innerHTML = createArtistEmbedMarkup(payload);
    observeImpressionTargets(container);
    sendPayload(payloadForEvent("artist_profile_view", container, { source: "shopify_artist_embed" }));
    return true;
  }

  function renderArtistEmbedError(container) {
    if (!container) return;
    container.innerHTML = '<div class="artclub-artist-embed__error">The artist profile could not be loaded right now.</div>';
  }

  function fetchArtistEmbed(container) {
    var slug = normalizeHandle(container && container.dataset ? container.dataset.artclubArtistSlug || "" : "");
    var url = getEmbedApiUrl(slug);
    if (!slug || !url) {
      renderArtistEmbedError(container);
      return Promise.resolve(false);
    }

    container.innerHTML = '<div class="artclub-artist-embed__loading">Loading artist profile…</div>';

    return fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      mode: "cors",
    })
      .then(function (response) {
        if (!response.ok) throw new Error("artist_embed_fetch_failed");
        return response.json();
      })
      .then(function (payload) {
        return renderArtistEmbed(container, payload);
      })
      .catch(function () {
        renderArtistEmbedError(container);
        return false;
      });
  }

  function renderArtistEmbeds() {
    ensureArtistEmbedStyles();
    var containers = Array.prototype.slice.call(document.querySelectorAll("[data-artclub-artist-embed]"));
    if (!containers.length) {
      return Promise.resolve({ hasEmbedContainers: false, successfulEmbeds: 0 });
    }

    return Promise.all(
      containers.map(function (container) {
        return fetchArtistEmbed(container);
      })
    ).then(function (results) {
      var successfulEmbeds = results.filter(Boolean).length;
      return { hasEmbedContainers: true, successfulEmbeds: successfulEmbeds };
    });
  }

  function trackPageViews(renderResult) {
    var context = pageContext();
    var artworkTarget = document.querySelector("[data-artclub-track-impression='artwork']");
    var hasEmbedContainers = Boolean(renderResult && renderResult.hasEmbedContainers);

    if (!hasEmbedContainers) {
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

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  ready(function () {
    observeImpressionTargets(document);
    setupClickTracking();
    setupArtistEmbedInteractions();
    renderArtistEmbeds().then(function (renderResult) {
      trackPageViews(renderResult);
    });
  });
})();
