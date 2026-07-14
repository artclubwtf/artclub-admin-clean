# ARTCLUB Network platform parity

Status values: `complete`, `partial`, `blocked`, `not started`. iOS and Android status describes implemented app behavior; signed store builds remain an external release step.

| Feature | Web | iOS | Android | Analytics | Deep Link | Notes |
|---------|-----|-----|---------|-----------|-----------|-------|
| Authentication, registration and secure logout | complete | complete | complete | complete | complete | Native uses hashed bearer sessions and SecureStore; no second user store. |
| Role onboarding and existing artist recognition | complete | complete | complete | complete | complete | Shared User, NetworkProfile and CanonicalArtist identity. |
| Home network dashboard | complete | complete | complete | complete | complete | One bounded aggregate request; no infinite stream. |
| Profile identity, completion and maintenance | complete | complete | complete | complete | complete | Artist canonical route stays `/artist/[slug]`; shared deterministic completion logic. |
| Profile share, follow and appreciation | complete | complete | complete | complete | complete | Native Share Sheet and persisted viewer actions. |
| Network discovery and search | complete | complete | complete | complete | complete | Search uses name, identity, place, discipline and interests. |
| Connections and requests | complete | complete | complete | complete | complete | Connect also follows; accept/decline are persisted. |
| Following | complete | complete | complete | complete | complete | Shared NetworkFollow records. |
| Message requests | complete | complete | complete | complete | complete | Native and web enforce the 100-character contract. |
| Conversations and messages | complete | complete | complete | complete | complete | Text/image messages, read/unread state, pagination, mute/block/report; no content in analytics. |
| Events, RSVP and organizer editing | complete | complete | complete | complete | complete | 4:5 media, timezone, ticket and share actions. |
| Updates | complete | complete | complete | complete | complete | Chronological connection/follow scope; existing post data is retained. |
| Create update and process media | complete | complete | complete | complete | complete | Native image/video picker and persisted upload endpoint. |
| Artwork upload | complete | complete | complete | complete | complete | Admin API creates a Shopify draft; mobile has no Shopify credentials. |
| Collection entry | complete | complete | complete | partial | complete | Available to collector/art-enthusiast roles; private by default. |
| Event creation | complete | complete | complete | complete | complete | Restricted to eligible roles. |
| Explore Art and artwork detail | complete | complete | complete | complete | complete | Shopify-backed cache via Admin APIs only; two-column native layout. |
| In-app notifications | complete | complete | complete | complete | complete | Unread badge only reflects persisted unread notifications. |
| Push token registration | n/a | complete | complete | partial | complete | Delivery is blocked until APNs/FCM credentials and a sender worker are configured. |
| Light, Dark and System theme | complete | complete | complete | n/a | n/a | Shared design tokens. |
| Image, video and camera input | complete | complete | complete | complete | n/a | Progress is represented as a bounded busy state; byte-level progress remains partial. |
| First-party analytics | complete | complete | complete | complete | n/a | Includes platform/app version; message contents are never accepted. |
| Custom-scheme deep links | n/a | complete | complete | n/a | complete | `artclub://` routes resolve through Expo Router. |
| Universal Links / App Links | partial | partial | partial | n/a | complete | App config is complete; association files must be deployed on the production domain. |
| Signed development/store build | n/a | blocked | blocked | n/a | n/a | Requires Apple/Google signing credentials outside this repository. |

This table must be updated whenever a network feature changes.
