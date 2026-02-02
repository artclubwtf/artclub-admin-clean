# REPORT_ADMIN_CURRENT_STATE

## Repo overview
- Top-level folders/files: app, components, docs, lib, models, public, tests, types, middleware.ts, next.config.mjs, package.json, eslint.config.mjs, tsconfig.json, postcss.config.mjs
- Framework: Next.js 16 App Router (app/), React 19, TypeScript
- Data: MongoDB via Mongoose
- Auth: next-auth (credentials provider, JWT sessions) + custom customer session cookie
- Validation: zod (request and model input validation)
- Media: AWS S3 (aws-sdk v3) and Shopify staged uploads
- Analytics: Google Analytics Data API (GA4)
- AI: OpenAI chat completions for concept export (optional) + external AI worker for Shopify artwork automation
- Styling: Tailwind CSS (v4)
- Next config: proxyClientMaxBodySize increased to 50MB for multipart uploads

## How to run (commands)
- Install: `npm install`
- Dev server: `npm run dev` (Next dev, default port 3000)
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- Node: 20.x (per package.json engines)

## Admin features (pages/routes)
Admin area requires team role via middleware and NextAuth session.
- /admin (Dashboard)
  - Metrics cards: orders today, open payouts, missing contracts, missing payout details
  - Snapshot: orders and GA4 KPIs (if GA4 configured)
- /admin/artists
  - Search and filter by stage
  - Merge DB artists with Shopify metaobjects
  - Import Shopify artist metaobject into Mongo
- /admin/artists/[id]
  - Edit artist core info, stage, internal notes, public profile fields
  - Sync to Shopify metaobject
  - Media uploads (S3) and profile images via Shopify files
  - Contract uploads (PDF) and contract terms (commission)
  - Payout details and payout transactions
  - Orders summary (Shopify + POS) and payout outstanding
  - Create artist user account (temp password)
  - Create Shopify artwork products (single and bulk, with optional AI worker tagging)
  - Send/receive messages with artist
- /admin/applications
  - List/filter registrations, search by name/email
- /admin/applications/[id]
  - View application detail, media, artworks
  - Update Shopify category mapping
  - Accept/reject application (creates artist, Shopify metaobject, Shopify draft products, migrates media)
- /admin/terms
  - Manage terms documents and versions (draft/publish)
- /admin/orders
  - View Shopify + POS orders, filter by date/source/artist
  - Import from Shopify into cache
  - Create/edit POS orders
  - Override line items (artist attribution, sale type, gross)
- /admin/analytics
  - Sales analytics from cached Shopify/POS data
  - Geo breakdown (countries/cities)
  - GA4 web analytics (if configured)
- /admin/products
  - Simple Shopify products list (read-only)
- /admin/concepts
  - Concepts list + filter
- /admin/concepts/new, /admin/concepts/[id]
  - CRUD concepts, statuses, sections, references, assets
  - AI export to proposal/email (OpenAI optional, local fallback)
  - Export page for PDF generation
- /admin/brands
  - Manage brand settings (artclub, alea)
  - Edit tone, about, colors, typography, logos
- /admin/users
  - List users (team/artist/customer)
- /admin/requests
  - Review artist requests (artwork creation, payout updates)

Non-admin (relevant for mobile planning):
- /artist
  - Artist portal: overview, media, artworks, contracts, messages, payout, change password
- /apply and /apply/[id]/dashboard
  - Artist onboarding flow with application token, uploads, and submission
- /login
  - Team/artist login via NextAuth credentials
- /account/*
  - Customer login/register/logout for Shopify app proxy use
- /setup
  - First-time admin setup (creates initial team user)

## Data model (Mongo collections)
Connection: lib/mongodb.ts uses a global mongoose cache and requires MONGODB_URI.

- Artist
  - Fields: name, email, phone, stage (Idea/In Review/Offer/Under Contract), internalNotes, tags
  - publicProfile: name/displayName/quote/intro text fields, category, images, bio, location, website, instagram, heroImageUrl
  - shopifySync: metaobjectId, handle, lastSyncedAt, lastSyncStatus
  - Validation: zod create/update schemas
- User
  - Fields: email (unique), role (team/artist/customer), name, shopDomain, shopifyCustomerGid, artistId ref, pendingRegistrationId ref, onboardingStatus, passwordHash, mustChangePassword, isActive
  - Index: unique compound { email, shopDomain }
- ArtistApplication
  - Fields: status (draft/submitted/in_review/accepted/rejected), applicationTokenHash, expiresAt
  - Links: linkedArtistId (Artist), linkedUserId (User)
  - Data: personal, shopify, profileImages, intents, legal, admin notes
  - Indexes: applicationTokenHash, personal.email
- ApplicationArtwork
  - Fields: applicationId ref, title, dimensions, offering, originalPriceEur, mediaIds ref, status, shopifyProductId
  - Validation: requires mediaIds, originalPrice when offering includes originals
- Media
  - Fields: ownerType (artist/application), ownerId, artistId ref, kind (artwork/social/other)
  - Storage: s3Key (required), url, previewUrl, filename, mimeType, sizeBytes
  - Pre-validate: sets ownerId for artist-owned media
- MessageThread
  - Fields: artistId ref (unique), lastMessageAt
- Message
  - Fields: threadId ref, artistId ref, senderRole (artist/team), text, mediaIds
  - Index: { threadId, createdAt: -1 }
- Contract
  - Fields: kunstlerId (string), contractType, filename, s3Key, s3Url, mimeType, sizeBytes, signedAt
  - Validation: zod create/update schemas
- ContractTerms (collection: contract_terms)
  - Fields: kunstlerId (unique), printCommissionPct, originalCommissionPct, effectiveFrom, notes
- PayoutDetails
  - Fields: kunstlerId (unique), accountHolder, iban, bic, bankName, address, taxId
  - Validation: zod create/update schemas
- PayoutTransaction (collection: payout_transactions)
  - Fields: artistMongoId, artistMetaobjectGid, amount, currency, method, reference, note
- ShopifyOrderCache (collection: shopify_orders_cache)
  - Fields: shopifyOrderGid (unique), orderName, createdAt/processedAt, status fields, totals, lineItems, allocations, lastImportedAt
  - Index: createdAt
- PosOrder (collection: pos_orders)
  - Fields: createdBy, note, lineItems, totals
  - Index: createdAt
- OrderLineOverride (collection: order_line_overrides)
  - Fields: orderSource (shopify/pos), order id, lineKey, overrides (artistMetaobjectGid, saleType, gross)
- Request
  - Fields: artistId, type (artwork_create/payout_update), status, payload, result, createdByUserId, reviewerUserId, reviewerNote, appliedAt
- BrandSettings
  - Fields: key (artclub/alea, unique), displayName, tone, about, defaultOfferBullets, logos, colors, typography
- Concept
  - Fields: title, brandKey, type (sponsoring/leasing/event), status, granularity
  - Sections: goalContext/targetAudience/narrative/kpis/legal
  - References: artists, artworks, collections
  - Assets: s3/shopify_file/url
  - Exports: proposalMarkdown/emailDraft/provider/lastGeneratedAt
- ConceptSnapshot
  - Fields: conceptId ref, status, title, payload (brand/type/granularity/sections/references/assets/exports)
- TermsDocument
  - Fields: key (unique), title, activeVersionId ref
- TermsVersion
  - Fields: documentId ref, version, status, effectiveAt, content, changelog, createdByUserId ref
  - Indexes: unique (documentId, version), (documentId, status)
- CustomerSession
  - Fields: userId ref, token (unique), expiresAt
  - TTL index: expiresAt (expireAfterSeconds 0)
- Artwork
  - Fields: artistId ref, title, saleType, price, editionSize, images, shopify metadata
  - Note: API endpoints disabled; artworks managed in Shopify

Seeds/migrations:
- Terms: lib/terms.ts auto-creates default document/version for artist_registration_terms
- Brands: /api/brands seeds default brand settings if none exist
- Admin customer seed endpoint: /api/admin/customers/seed (team-only)
- No migration tooling found

## API map
All routes live under app/api (Next.js route handlers). Middleware enforces auth for /admin, /artist, and most /api routes.

Auth and sessions
- POST /api/auth/login (customer) - rate-limited login, sets customer session cookie
- POST /api/auth/register (customer) - rate-limited register, sets customer session cookie
- POST /api/auth/logout (customer)
- GET /api/auth/me (customer session)
- /api/auth/[...nextauth] (team/artist NextAuth)
- POST /api/account/change-password (team/artist)
- GET/POST /api/setup (initial team user)
- POST /api/artist-onboarding/signup
- POST /api/artist-onboarding/login

Applications (artist onboarding)
- POST /api/applications/create
- GET/PATCH /api/applications/[id]
- POST /api/applications/[id]/submit
- GET/POST /api/applications/[id]/media
- DELETE /api/applications/[id]/media/[mediaId]
- GET/POST /api/applications/[id]/artworks

Admin applications
- GET /api/admin/applications
- GET/PATCH /api/admin/applications/[id]
- PATCH /api/admin/applications/[id]/status

Artists and users
- GET/POST /api/artists
- GET/PATCH/DELETE /api/artists/[id]
- POST /api/artists/[id]/shopify-sync
- GET /api/artists/[id]/orders-summary
- POST /api/artists/import-from-shopify
- GET /api/users
- POST /api/users/create-artist

Media and uploads
- GET/POST /api/media
- DELETE /api/media/[id]
- GET/POST /api/artist/media
- DELETE /api/artist/media/[id]
- GET /api/artist/media/[id]/download
- POST /api/uploads/presign
- POST /api/uploads/complete
- POST /api/uploads/multipart/create
- POST /api/uploads/multipart/sign-part
- POST /api/uploads/multipart/complete

Contracts and payouts
- GET /api/contracts
- POST /api/contracts/upload
- GET/POST /api/contracts/terms
- GET /api/artist/contracts
- GET /api/artist/contracts/[id]/download
- GET/POST /api/payout
- POST /api/payout-transactions
- GET /api/artist/payout

Orders and analytics
- GET/POST /api/orders
- GET /api/orders/detail
- POST /api/orders/import-from-shopify
- POST /api/orders/overrides
- GET/POST/PATCH /api/orders/pos
- GET /api/analytics/overview
- GET /api/analytics/locations
- GET /api/analytics/ga4/overview
- GET /api/analytics/ga4/status
- GET /api/admin/metrics

Concepts and brands
- GET/POST /api/concepts
- GET/PATCH/DELETE /api/concepts/[id]
- PATCH /api/concepts/[id]/status
- GET/POST /api/concepts/[id]/snapshots
- GET /api/concepts/[id]/pdf (requires ENABLE_SERVER_PDF and Playwright)
- POST /api/ai/concepts/generate
- GET/POST /api/brands
- GET/PATCH /api/brands/[key]
- POST /api/brands/[key]/logo

Requests and messaging
- GET/POST /api/artist/requests
- GET /api/admin/requests
- PATCH /api/admin/requests/[id]
- GET/POST /api/artist/messages
- GET/POST /api/admin/artists/[id]/messages

Shopify + proxy
- GET /api/shopify/artists
- GET /api/shopify/collections
- GET /api/shopify/products-by-artist
- POST /api/shopify/artworks/create
- GET /api/shopify/orders
- POST /api/shopify/files/upload
- GET /api/shopify/files/resolve
- GET /api/shopify/resolve-media
- GET /api/debug/metaobjects
- GET/POST /api/proxy/[...path] (Shopify app proxy for customer session/login/register/logout)

## Auth and roles
- Roles: team, artist, customer
- Team and artist auth: NextAuth credentials provider, JWT session strategy, sign-in at /login
- Middleware rules:
  - /admin requires team role
  - /artist requires artist role, enforces mustChangePassword and pendingRegistrationId redirects
  - /api: allows selected public endpoints; otherwise requires NextAuth token
  - /api/uploads allowed for team and artist
  - /api/artist/* requires artist role and artistId
- Artist onboarding:
  - Application token stored as hash in ArtistApplication
  - Token accepted via x-application-token header or ?token
- Customer auth:
  - Custom session token stored in CustomerSession collection
  - Session cookie: ac_customer_session (7 day TTL)
  - Login/register rate-limited in-memory per IP
- App proxy:
  - Shopify app proxy signature verification via SHOPIFY_API_SECRET
  - AC_PROXY_SKIP_SIGNATURE can disable verification

## Media pipeline (Shopify/S3)
- S3
  - Media uploads for artists and applications
  - Contracts stored as PDFs in S3
  - Upload paths: artist/<artistId>/..., application/<applicationId>/..., contracts/<artistId>/...
  - Single PUT presign and multipart upload flows
  - Public URLs via S3_PUBLIC_BASE_URL if set, otherwise signed URLs
- Shopify
  - Staged uploads and fileCreate for profile images and assets
  - Resolve endpoints for Shopify file/media IDs
  - Products created as Shopify draft products (artworks)
- Caching
  - In-memory cache for Shopify resolve-media (10 minutes)
  - GA4 responses cached in-memory (10 minutes)
- No explicit image transforms or thumbnail generation found

## Integrations/webhooks
- Shopify Admin GraphQL API (artists metaobjects, products, collections, orders, files)
- Shopify app proxy (customer auth/session endpoints)
- AWS S3 (media and contracts)
- Google Analytics Data API (GA4)
- OpenAI API (concept generation, optional)
- External AI worker (Shopify artwork automation)
- No webhook handlers found

## Env var names (no values)
Core
- MONGODB_URI
- NEXTAUTH_SECRET
- NODE_ENV

Shopify
- SHOPIFY_SHOP_DOMAIN
- SHOPIFY_STORE_DOMAIN
- SHOPIFY_ADMIN_ACCESS_TOKEN
- SHOPIFY_API_VERSION
- SHOPIFY_API_SECRET
- SHOPIFY_PRIMARY_LOCATION_ID

S3
- S3_REGION
- S3_ACCESS_KEY_ID
- S3_SECRET_ACCESS_KEY
- S3_BUCKET
- S3_PUBLIC_BASE_URL

Analytics
- GA4_PROPERTY_ID
- GA4_SERVICE_ACCOUNT_JSON_BASE64

AI
- OPENAI_API_KEY
- OPENAI_MODEL
- AI_WORKER_SHOP
- AI_WORKER_LIMIT
- AI_WORKER_KEY
- AI_WORKER_PRODUCTS_URL
- AI_WORKER_TAGS_URL

Proxy and misc
- AC_PROXY_DEBUG_HEADERS
- AC_PROXY_SKIP_SIGNATURE
- COOKIE_DOMAIN
- NEXT_PUBLIC_BASE_URL
- ENABLE_SERVER_PDF

Tests
- AUTH_FLOW_BASE_URL

## TODO/FIXME summary
- No TODO/FIXME markers found.

## Risks and immediate gaps
- No migration tooling; seeds are implicit via API calls (brands, terms). Data changes may be manual.
- Rate limiting and caches are in-memory; not shared across instances and reset on cold starts.
- Customer auth uses a separate session system from NextAuth; mobile clients will need a clear auth strategy.
- Many admin endpoints rely on middleware for access control; direct invocation outside Next.js middleware context would be risky.
- Long-running admin actions (Shopify product creation, media downloads) run inline in API routes and may time out in serverless.
- Shopify order sync is manual (import endpoint) rather than webhook-driven; cache can become stale.
- Artwork Mongo endpoints are disabled; source of truth is Shopify only.
- Limited automated test coverage (only auth-flow test found).

## Proposed next 10 tasks (ordered, small, actionable)
1) Draft an OpenAPI spec for all /api endpoints, including auth requirements and response schemas.
2) Decide mobile auth strategy (reuse NextAuth JWT vs dedicated token) and implement a mobile session token endpoint.
3) Add pagination and limit parameters for list endpoints (orders, artists, media, messages, requests).
4) Add Shopify webhooks for orders/products to keep ShopifyOrderCache current (remove manual import dependency).
5) Move long-running Shopify artwork creation to a background job/queue with status polling.
6) Add image variants/thumbnails (S3 or Shopify) and expose sizes in Media responses.
7) Normalize error responses (common error schema + error codes) across API routes.
8) Add seed/migration scripts (CLI) for brands, terms, admin user, and test data.
9) Expand automated tests to cover onboarding, artist requests, and order overrides.
10) Add audit logging for admin actions (approvals, payouts, contract uploads).
