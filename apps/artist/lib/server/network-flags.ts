export function isNetworkMvpEnabled() {
  return process.env.NETWORK_MVP_ENABLED === "true";
}

export function isNetworkFeatureEnabled(name: "events" | "messages" | "donations") {
  if (!isNetworkMvpEnabled()) return false;
  const value = process.env[`NETWORK_${name.toUpperCase()}_ENABLED`];
  return value === undefined ? true : value === "true";
}
