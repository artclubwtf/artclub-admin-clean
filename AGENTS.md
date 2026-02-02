# ARTCLUB Platform Agent Rules

- Shopify is source of truth for products/artworks.
- Mobile NEVER calls Shopify directly. It calls apps/admin mobile API endpoints.
- Shared domain types live in packages/models.
- Shared API wrapper lives in packages/api-client.
- Any change must follow: models -> API -> admin UI -> mobile UI (when relevant).
- Never print secrets from envs.
- Do not refactor unrelated files.
