export function trackNetwork(eventType: string, fields: Record<string, unknown> = {}) {
  const body = JSON.stringify({ eventType, source: "network", path: location.pathname, referrer: document.referrer, ...fields });
  void fetch("/api/network/analytics/track", { method: "POST", headers: { "Content-Type": "application/json", "x-artclub-session": sessionId() }, body, keepalive: true }).catch(() => undefined);
}
function sessionId() { const key = "artclub-network-session"; let value = sessionStorage.getItem(key); if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); } return value; }
