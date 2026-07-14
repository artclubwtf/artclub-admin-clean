# ARTCLUB Network deployment and native release

## Runtime configuration

Do not commit values. The native bundle needs only:

- `EXPO_PUBLIC_API_BASE_URL`: public HTTPS origin of `apps/admin`, without a trailing slash.

The Admin service needs its existing application configuration plus:

- `MONGODB_URI` for users, network data and hashed mobile sessions.
- `MOBILE_API_PUBLIC_BASE_URL` for durable public media URLs. This must be HTTPS and must not be localhost.
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; `S3_PUBLIC_BASE_URL` if required by the existing S3 setup.
- `SHOPIFY_SHOP_DOMAIN` (or the existing `SHOPIFY_STORE_DOMAIN`), `SHOPIFY_ADMIN_ACCESS_TOKEN`, and optionally `SHOPIFY_API_VERSION`.
- `SHOPIFY_WRITE_ENABLED=1` only in environments where authenticated artists may create draft artwork products.
- `SHOPIFY_PRIMARY_LOCATION_ID` where the existing inventory workflow requires it.

The client contains no Shopify, database, S3, APNs or FCM secret.

## Native identity and links

- iOS bundle: `com.artclubmm.network`
- Android package: `com.artclubmm.network`
- custom scheme: `artclub`
- associated host: `network.artclub.wtf`

Deploy an Apple association document at `https://network.artclub.wtf/.well-known/apple-app-site-association` that authorizes the production Apple Team ID plus `com.artclubmm.network`. Deploy `https://network.artclub.wtf/.well-known/assetlinks.json` with the Android application ID and the production signing-certificate SHA-256 fingerprint. Both responses must be HTTPS, unredirected and served with JSON content types.

Supported route shapes include `/home`, `/network`, `/messages/:id`, `/events/:id`, `/artist/:slug`, `/updates`, and `/explore-art` for both HTTPS links and the `artclub://` scheme.

## Push notifications

The app requests permission on a physical device, obtains an Expo push token and stores it through `/api/mobile/v1/network/push-token`. Production delivery additionally requires:

1. Apple Push Notification credentials in the EAS project.
2. Firebase Cloud Messaging V1 credentials for Android.
3. A server worker that maps persisted NetworkNotification records to enabled MobilePushToken records and sends only to recipients other than the actor.
4. Deep-link `path` data in each push payload.

Token registration is complete; delivery is intentionally not claimed as complete without these external credentials and the sender worker.

## Verification and release

```sh
pnpm install
pnpm --filter artist exec tsc --noEmit --pretty false
pnpm --filter artist build
pnpm --filter admin exec tsc --noEmit --pretty false
pnpm --filter admin build
pnpm --filter mobile typecheck
pnpm --filter mobile exec expo config --type public
pnpm --filter mobile export:ios
pnpm --filter mobile export:android
```

After `eas login`, create signed internal builds with:

```sh
eas build -p ios --profile development
eas build -p android --profile development
```

Run the manual test matrix in the implementation handoff before store submission. Real artwork creation must be tested against a non-production Shopify artist first because it creates a real draft product.
