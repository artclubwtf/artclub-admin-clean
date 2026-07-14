# ARTCLUB Network platform parity

Status values: `complete`, `partial`, `blocked`, `not started`.

| Feature | Web | iOS | Android | Analytics | Deep Link | Notes |
|---------|-----|-----|---------|-----------|-----------|-------|
| Authentication and registration | complete | partial | partial | partial | complete | Native secure-session migration in progress. |
| Role onboarding and existing artist recognition | complete | partial | partial | complete | complete | Uses the shared user and CanonicalArtist identity. |
| Home network dashboard | partial | partial | partial | partial | complete | Aggregated API and dashboard modules in progress. |
| Profile identity and maintenance | complete | partial | partial | complete | complete | Canonical artist route remains `/artist/[slug]`. |
| Network discovery | complete | partial | partial | complete | complete | Search and relevance reasons are shared API data. |
| Connections and requests | complete | partial | partial | complete | complete | Connect automatically follows; decline retains follow. |
| Following | complete | partial | partial | complete | complete | Shared NetworkFollow persistence. |
| Messages and message requests | complete | partial | partial | complete | complete | Message contents are excluded from analytics. |
| Events and RSVP | complete | partial | partial | complete | complete | Event artwork uses a 4:5 display crop. |
| Updates | partial | partial | partial | partial | complete | Existing NetworkPost records remain unchanged. |
| Create update/process | complete | partial | partial | complete | complete | Existing upload persistence is reused. |
| Artwork upload | complete | partial | partial | complete | complete | Shopify remains the artwork source of truth. |
| Event creation | complete | partial | partial | complete | complete | Available only to permitted profile roles. |
| Explore Art | complete | partial | partial | complete | complete | Mobile receives artwork data through admin APIs only. |
| Notifications | complete | partial | partial | partial | complete | In-app complete on web; native push setup remains external. |
| Light, Dark and System theme | complete | partial | partial | n/a | n/a | Shared tokens drive web and native palettes. |
| Media image/video uploads | complete | partial | partial | complete | n/a | Native picker and upload progress in progress. |
| Profile sharing | complete | partial | partial | complete | complete | Web copy/native share and native Share Sheet. |
| First-party analytics | complete | partial | partial | complete | n/a | Platform and app version fields in progress. |
| Universal Links / App Links | partial | partial | partial | n/a | complete | Schemes are configured; hosted association files are external. |
| Push notifications | n/a | blocked | blocked | partial | complete | Requires APNs/FCM and EAS project credentials. |

This table must be updated whenever a network feature changes.
