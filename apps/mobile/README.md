# ARTCLUB native app

Native Expo Router client for iOS and Android. It uses the Admin mobile API; it never connects to Shopify directly.

## Local development

```sh
EXPO_PUBLIC_API_BASE_URL=https://your-admin-origin.example pnpm --filter mobile dev
```

Use a physical device or development build for push notifications. Authentication tokens are stored in SecureStore.

## Checks

```sh
pnpm --filter mobile typecheck
pnpm --filter mobile exec expo config --type public
pnpm --filter mobile export:ios
pnpm --filter mobile export:android
```

## EAS development builds

```sh
eas login
eas build -p ios --profile development
eas build -p android --profile development
```

Store signing and APNs/FCM credentials are external prerequisites. See `docs/network-deployment.md`.
