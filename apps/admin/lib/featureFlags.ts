function parseFlag(value: string | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isMigrationModeEnabled() {
  return parseFlag(process.env.MIGRATION_MODE);
}

export function isShopifyWriteEnabled() {
  return parseFlag(process.env.SHOPIFY_WRITE_ENABLED);
}

export function isShopifyWebhooksEnabled() {
  return parseFlag(process.env.SHOPIFY_WEBHOOKS_ENABLED);
}

export function assertMigrationModeEnabled() {
  if (!isMigrationModeEnabled()) {
    throw new Error("migration_mode_disabled");
  }
}

export function assertShopifyWriteEnabled() {
  if (!isShopifyWriteEnabled()) {
    throw new Error("shopify_write_disabled");
  }
}
