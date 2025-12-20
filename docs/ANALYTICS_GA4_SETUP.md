# GA4 Server-to-Server Setup (Data API)

Minimal steps to enable the GA4 Data API for this app. No secrets are stored here.

## 1) Google Cloud project
1. Create/select a GCP project in https://console.cloud.google.com/
2. Enable the **Google Analytics Data API** in `APIs & Services > Library`

## 2) Service account + key
1. Go to `IAM & Admin > Service Accounts`
2. Create service account (e.g. `ga4-data-api`)
3. Grant basic role `Viewer` (fine for API access)
4. Create key: `Keys > Add Key > JSON` (download once; keep safe)

## 3) GA4 property access
1. Open GA4 Admin for your property
2. `Admin > Property Access Management > Add users`
3. Add the service account email
4. Role: **Viewer** (enough for reporting)

## 4) Env vars
- `GA4_PROPERTY_ID` — e.g. `123456789`
- `GA4_SERVICE_ACCOUNT_JSON_BASE64` — base64 of the JSON key

Quick base64 on macOS/Linux:
```sh
cat service-account.json | base64 | pbcopy
```
(Use `clip` on Windows.)

## 5) Deploy (DigitalOcean App Platform)
- Add the env vars above in the DO App settings (Scope: Build & Run)
- Redeploy the app

## 6) Troubleshooting
- **403 / insufficient permissions**: Service account not added to GA4 property (step 3), or wrong property ID.
- **API not enabled**: Enable Google Analytics Data API in GCP (step 1/2).
- **invalid_grant**: Clock skew or deleted service account key; generate a new key, update base64, redeploy.
- **Still no data**: Check that the property has traffic and that the date range contains data.
