# ARTCLUB Network MVP

## Architecture audit and decisions

- The monorepo uses Next.js 16, NextAuth JWT sessions, MongoDB/Mongoose and shared packages via pnpm workspaces.
- `CanonicalArtist` and `CanonicalProduct` remain the canonical artist/artwork records synchronized with Shopify. Network records reference them by ObjectId.
- Artist core fields are always resolved live from `User` + `CanonicalArtist`. `NetworkProfile` contributes only Network-specific fields. The same `UnifiedProfileView` renders `/artist/[slug]` and the authenticated profile route; viewer actions are layered on top.
- Existing linked artists are merged into Discovery and profile resolution directly from `CanonicalArtist`, even when no `NetworkProfile` exists. Lazy profile materialization happens only when an ObjectId is required for an interaction; the backfill is optional optimization.
- The feed merges `NetworkPost` and published `CanonicalProduct` records at read time with a stable `(createdAt, typed id)` cursor. It never creates artificial artwork posts.
- The Artist app uses the same Mongo database and existing S3 uploader. Network images are limited to 20 MB; videos to 100 MB; accepted MIME types are explicit.
- Existing Artist↔Team workspace messaging is preserved. Network direct messages use separate conversation/message collections because their participants and authorization rules differ.
- Existing `AnalyticsEvent` is extended for Network identifiers. No second analytics event store is introduced.
- Stripe was absent. Donations use optional Stripe Connect Express through Stripe's server API; missing configuration produces a setup state and never a fake payment.
- The feature flag defaults off. Existing Artist routes and public `/artist/[slug]` remain available when it is disabled.

## Commands

```bash
pnpm install
pnpm --filter admin exec tsc --noEmit --pretty false
pnpm --filter artist exec tsc --noEmit --pretty false
pnpm --filter artist test
pnpm --filter admin build
pnpm --filter artist build
```

Local development:

```bash
NETWORK_MVP_ENABLED=true pnpm --filter artist dev
pnpm --filter admin dev
```

## Environment

Existing variables remain required: `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SHOPIFY_SHOP_DOMAIN`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, and optionally `S3_PUBLIC_BASE_URL`.

Network variables:

```text
NETWORK_MVP_ENABLED=true
NETWORK_EVENTS_ENABLED=true
NETWORK_MESSAGES_ENABLED=true
DONATIONS_ENABLED=false
ARTIST_APP_URL=https://network-preview.example.com
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
DONATION_PLATFORM_FEE_BPS=0
NETWORK_SEED_ENABLED=false
```

`STRIPE_CONNECT_CLIENT_ID` and the publishable key are reserved for future OAuth/Elements flows; server-hosted Express onboarding and Checkout currently require the secret and webhook secret. Register the webhook URL `/api/webhooks/stripe` for `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, and `account.updated`.

## Safe rollout

1. Deploy Admin and Artist previews from `experiment/artclub-network-mvp`; do not deploy this branch over production.
2. Prefer a separate preview database. If the existing database is used, keep `NETWORK_MVP_ENABLED=false` until both apps are deployed.
3. Enable the flag. Existing linked artists appear immediately; no migration is required. Optionally call `POST /api/admin/network/backfill` to pre-materialize interaction identities.
4. Check `/admin/network` for users without profiles, artists without `linkedUserId`, duplicate slugs, reports, and product events.
5. Configure S3 CORS for the Artist preview origin and Stripe webhooks before enabling donations.
6. Set each Shopify artist metaobject `app_url` to the exact public Artist-app URL. The `ac-artist-app-embed` section reads this value directly and validates height messages against that URL's origin.
7. CSP permits `artclub.wtf`, `www.artclub.wtf`, `*.myshopify.com`, and `*.shopifypreview.com` as frame ancestors. Add a narrower preview domain if Shopify changes its preview host.

Preview seed data is explicitly opt-in and production-blocked. Set `NETWORK_SEED_ENABLED=true`, then call `POST /api/admin/network/seed` with existing preview user IDs for `artist`, `collector`, `gallery`, and `event_series`. It upserts deterministic profiles, a post, connection, conversation/message, event, and collection item.

## Routes

App: `/feed`, `/network`, `/create`, `/messages`, `/messages/[id]`, `/notifications`, `/profile`, `/profile/[slug]`, `/collection`, `/events`, `/events/[id]`, `/events/new`, `/settings`, `/settings/profile`, `/settings/artworks`, `/settings/earnings`, `/settings/donations`, `/settings/analytics`, `/settings/public-profile`, `/donations/success`, and `/donations/cancel`.

API groups under `/api/network`: unified profile/search, mixed feed, post/artwork interactions, normalized connections, follows, profile likes, 100-character message requests, conversations/messages/read, events/RSVP, collection, notifications, reports, uploads, donations, and analytics. Admin endpoints are under `/api/admin/network`; Stripe webhooks are under `/api/webhooks/stripe`.

## Manual acceptance flow

1. Before any backfill, log in as an existing linked artist; verify the artist appears in Discovery, `/profile/[slug]`, `/artist/[slug]`, and the feed with identical canonical content.
2. Register a collector, complete Network onboarding, switch Light/Dark/System themes, and reload.
3. Publish text, image, and video posts; like, comment, save, share, edit/delete via API, and verify cursor loading.
4. Search the artist, send a request, verify the recipient sees Incoming/Accept/Decline on profile, Notifications and Network → Requests, then accept and verify full chat access.
5. Before accepting, send one message request of at most 100 characters; verify a second is rejected and the first becomes the conversation's initial message after acceptance.
6. Follow/unfollow and appreciate/unappreciate a profile; verify counts persist and neither action unlocks messaging.
7. Create and publish an event as an eligible role, RSVP as the collector, open its ticket URL, then cancel it as organizer.
8. Add a collection item and verify purchase price remains private.
9. Complete Stripe Express onboarding in test mode, create Checkout, deliver signed test webhooks, and verify paid/refunded states and Artist history.
10. Open `/admin/network`, review diagnostics, submit a report, hide content/suspend a profile, and verify the audit record.
11. Open the Shopify artist metaobject page and verify no nested scrollbar, responsive height, exact `app_url`, and product links opening the parent tab.

## Known limits

- Realtime messaging uses 10-second polling; no new realtime infrastructure was introduced.
- Feed “For You” is chronological by design.
- Email/push notifications are not sent because no suitable existing delivery infrastructure exists.
- Stripe and live Shopify iframe behavior require external preview credentials/hosts and must be verified in their test environments.
