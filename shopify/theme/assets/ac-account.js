(async function(){
  const STORAGE_KEY = "ac_customer_session";

  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  const root = document.querySelector("[data-ac-account]");
  if(!root) return;

  const tabs = $all("[data-mode]", root);
  const form = $("[data-form]", root);
  const msg = $("[data-msg]", root);
  const submit = $("[data-submit]", root);

  const regFields = $("[data-register-fields]", root);
  const loginFields = $("[data-login-fields]", root);

  let mode = "login";

  function setToken(t){
    try { localStorage.setItem(STORAGE_KEY, t || ""); } catch(e) {}
  }
  function getToken(){
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch(e) { return ""; }
  }

  function setMode(next){
    mode = next;
    tabs.forEach(b => b.classList.toggle("is-active", b.dataset.mode === mode));
    if(mode === "register"){
      regFields.style.display = "";
      loginFields.classList.add("is-single");
      submit.textContent = "Create account";
      const pw = form.querySelector('[name="password"]');
      if(pw) pw.autocomplete = "new-password";
    } else {
      regFields.style.display = "none";
      submit.textContent = "Login";
      const pw = form.querySelector('[name="password"]');
      if(pw) pw.autocomplete = "current-password";
    }
    msg.textContent = "";
  }

  tabs.forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));

  async function postJSON(url, data){
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(data || {})
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch(e) {}
    if(!r.ok){
      const errMsg = (json && (json.error || json.message)) || text || ("HTTP " + r.status);
      throw new Error(errMsg);
    }
    return json;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    submit.disabled = true;

    const data = Object.fromEntries(new FormData(form).entries());
    data.email = (data.email || "").toString().trim();

    try{
      const endpoint = mode === "register" ? "/community/users/register" : "/community/users/login";
      const res = await postJSON(endpoint, {
        name: (data.name || "").toString().trim() || undefined,
        email: data.email,
        password: (data.password || "").toString()
      });

      if(res && res.ok && res.token){
        setToken(res.token);
        location.href = "/pages/account";
      } else {
        throw new Error("Unexpected response");
      }
    } catch(err){
      msg.textContent = String(err && err.message ? err.message : err);
    } finally {
      submit.disabled = false;
    }
  });

  // Optional: if already logged in, keep the page clean
  try{
    const t = getToken();
    if(t){
      const r = await fetch("/community/users/session?ac_session=" + encodeURIComponent(t), { headers:{Accept:"application/json"} });
      if(r.ok){
        const s = await r.json();
        if(s && s.ok && s.user){
          msg.textContent = "You’re already logged in.";
        }
      }
    }
  } catch(e) {}

  setMode("login");
})();
