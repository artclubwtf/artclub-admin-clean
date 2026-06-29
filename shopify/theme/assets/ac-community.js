(async function () {
  function qs(sel, root = document) { return root.querySelector(sel); }
  function show(el) { if (el) el.style.display = ""; }
  function hide(el) { if (el) el.style.display = "none"; }

  const TOKEN_KEY = "ac_customer_token";

  const root = document.querySelector("[data-ac-community-root]");
  if (!root) return;

  const outBox = qs('[data-ac-user="out"]', root);
  const inBox  = qs('[data-ac-user="in"]', root);
  const nameEl = qs("[data-ac-user-name]", root);
  const logoutBtn = qs("[data-ac-logout]", root);

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t || ""); } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }

  async function getSession() {
    const token = getToken();
    if (!token) return null;

    const url = "/community/users/session?token=" + encodeURIComponent(token);
    const r = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { "Accept": "application/json" }
    });

    if (!r.ok) return null;
    return r.json();
  }

  async function logout() {
    const token = getToken();
    clearToken();

    // Logout is best-effort (token might be empty)
    try {
      await fetch("/community/users/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ token })
      });
    } catch (e) {}

    location.reload();
  }

  const session = await getSession();
  if (session && session.ok && session.user) {
    hide(outBox); show(inBox);
    const label = session.user.name || session.user.email || "Account";
    if (nameEl) nameEl.textContent = label;
  } else {
    show(outBox); hide(inBox);
  }

  if (logoutBtn) logoutBtn.addEventListener("click", logout);
})();
