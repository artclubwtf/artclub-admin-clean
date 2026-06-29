(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__artclubArtistEmbedLoaded) return;
  window.__artclubArtistEmbedLoaded = true;

  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getContainerAppUrl(container) {
    return container && container.dataset ? trim(container.dataset.artclubAppUrl || "") : "";
  }

  function renderFallback(container, appUrl) {
    container.replaceChildren();

    var wrapper = document.createElement("p");
    var link = document.createElement("a");

    link.href = appUrl;
    link.target = "_top";
    link.rel = "noreferrer";
    link.textContent = "View artist profile";

    wrapper.appendChild(link);
    container.appendChild(wrapper);
  }

  function renderMissing(container) {
    container.replaceChildren();
    container.textContent = "Artist profile unavailable.";
  }

  function boot() {
    document.querySelectorAll("[data-artclub-artist-embed]").forEach(function (container) {
      var appUrl = getContainerAppUrl(container);
      if (!appUrl) {
        renderMissing(container);
        return;
      }

      renderFallback(container, appUrl);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
