# Admin-Dokumentation (Artclub)

## Überblick & Setup
- Admin unter `/admin` mit Sidebar (`app/admin/AdminSidebar.tsx`) für Dashboard, Artists, Orders, Analytics, Products, Concepts, Brands.
- Datenquellen: MongoDB (Künstler, Verträge, Payouts, Konzepte), Shopify Admin API (Produkte, Orders, Metaobjects), S3 (Verträge/Media), GA4 Data API (Web-Analytics). Wichtige Env-Variablen: `SHOPIFY_*`, `MONGODB_URI`, `S3_*`, `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON_BASE64`.
- UI ist Client-first (viele `useEffect`/`fetch` Calls); jeder Page-Load lädt live aus den APIs (`cache: "no-store"`).

## Dashboard (`app/admin/AdminDashboardClient.tsx`)
- Lädt `/api/admin/metrics` → Kacheln: Orders today, Open payouts (Künstler mit offenen Auszahlungen), Missing contract, Missing payout details.
- Snapshot-Tabelle:
  - Sales: `/api/analytics/overview?since/until` (heute vs. letzte 7 Tage, Revenue/Count).
  - Web: `/api/analytics/ga4/overview` (Sessions, Active Users). Hinweis, wenn GA4 env nicht gesetzt.
- Links aus den Kacheln springen direkt zu gefilterten Artists/Orders.

## Artists
### Liste (`app/admin/artists/ArtistsPageClient.tsx`)
- Such- und Stage-Filter (Stages: Idea → In Review → Offer → Under Contract).
- Merge von internen Künstlern (DB) und Shopify-Metaobjects:
  - DB-Künstler inkl. Stage + Kontakt.
  - Shopify-Metaobjects (noch nicht verknüpft) können via „Import“ nach Mongo geholt werden (`/api/artists/import-from-shopify`) und landen dann im Detail.
- Button „New artist“ erzeugt Minimal-Datensatz (`/api/artists`).

### Detail (`app/admin/artists/[id]/ArtistDetailClient.tsx`)
- Sticky Header: Stage-Wechsel, Save, Shopify-Sync. Kontext-CTA abhängig von Stage (z. B. „Upload contract“ in Offer).
- Tabs (werden je Stage freigeschaltet; Hinweis-Box wenn gesperrt):
  - **Overview**: Stammdaten (Name, Email, Phone), interne Notizen. Speichern via `PATCH /api/artists/:id`.
  - **Media**: Upload beliebiger Dateien (`/api/media` mit `kunstlerId`, `kind`). Delete/Set Hero Image möglich.
  - **Artworks**: Nur mit Shopify-Link. Galerie-Upload (kind=artwork) → Auswahl → Draft-Produkte in Shopify erzeugen (`/api/shopify/artworks/create`). Single-Create Formular (Titel, Sale Mode Print/Original, Preis, Maße, Kurzbeschreibung, Media-IDs). Bulk-Create (Defaults oder Tabellenmodus, Retry bei Fehlern).
  - **Contracts**: Provisionen pflegen (`/api/contracts/terms`), PDF-Upload (`/api/contracts/upload`, Typ/SignedAt). Listet bestehende Verträge.
  - **Public Profile**: Öffentliche Felder (Name, quote, Texte, Kategorie=Shopify Collection Search, Location/Website intern). Bild-Felder per Shopify Files Upload (`/api/shopify/files/upload`) oder GID manuell. „Sync to Shopify“ schickt Profil + Metaobject-Referenzen (`/api/artists/:id/shopify-sync`).
  - **Payout**: Bankdaten/Steuer-ID speichern (`POST /api/payout`). „Record payout“ legt Transaktion an (`/api/payout-transactions`) und aktualisiert Salden.
  - **Orders**: Zusammenfassung der Künstler-Umsätze aus Shopify/POS (`/api/artists/:id/orders-summary`, allTime/last30, outstanding/paid/earned). Payout-Historie wird hier angezeigt.
- Status-Badges zeigen pro Tab „ready/missing/locked“. Shopify-Status + letztes Sync-Result werden eingeblendet.

## Orders (`app/admin/orders/OrdersPageClient.tsx`)
- Filter: Source (Shopify/POS), Datumsrange (7/30/90/custom), Paid vs. alle, Cancelled ein/aus, Artist (Metaobject) oder „Unassigned“.
- Import-Button: `/api/orders/import-from-shopify?limit=25`.
- POS-Erfassung: Modal mit Datum/Note, beliebig viele Lines (Title, Qty, UnitPrice, SaleType, Artist) → POST `/api/orders/pos`.
- Tabelle zeigt Grunddaten und Zuordnungen. Klick öffnet Modal mit Line-Items (aus `/api/orders/detail`). Line-Override erlaubt Artist/SaleType/Gross anzupassen (`/api/orders/overrides`) und refresht Liste + Detail.

## Analytics (`app/admin/analytics/AnalyticsPageClient.tsx`)
- Tabs „Sales“ und „Web“ werden via Query-Params (`tab`, `start`, `end`, `compare`) gespiegelt.
- **Sales**: KPIs Revenue/Orders/AOV + Split Prints/Originals. Locations (Countries/Cities) aus `/api/analytics/overview` und `/api/analytics/locations` mit Range-Auswahl (7/30/90 Tage).
- **Web (GA4)**:
  - Status-Badge prüft `/api/analytics/ga4/status` (Property, Cache TTL oder „not configured“ mit Required-Env-Liste).
  - Frei wählbarer Datumsbereich, optional Compare zum vorherigen Zeitraum.
  - KPIs: Active/New Users, Sessions, Engaged Sessions, Engagement Rate. Tabellen für Countries, Cities, Devices, Sources (Top 10 jeweils) aus `/api/analytics/ga4/overview`.
  - Refresh-Button lädt GA-Daten; Fehler werden inline angezeigt.

## Products (`app/admin/products/page.tsx`)
- Minimaler Shopify-Reader: `fetchProducts(25)` über `@/lib/shopify` und listet Titel/IDs. Fehlerhinweis verweist auf `SHOPIFY_*` Env/Scopes.

## Concepts
### Liste (`app/admin/concepts/ConceptsListClient.tsx`)
- Filter nach Brand (artclub/alea), Type (sponsoring/leasing/event), Status (draft…won/lost), Search im Titel. Reset/Refresh Buttons.
- Links auf Detail, Button „New Concept“.

### Anlage (`app/admin/concepts/new/page.tsx`)
- Form mit Title, Brand, Type, Granularity → POST `/api/concepts`, redirect auf Detail.

### Detail (`app/admin/concepts/[id]/ConceptDetailClient.tsx`)
- Steps-Navigation (Basics, Content, Assets & References, Export).
- Basics: Title, Granularity, Status-Dropdown (`/api/concepts/:id/status`), Save (`PATCH /api/concepts/:id`). PDF-Export-Link `/admin/concepts/:id/export?autoprint=1`.
- Content: Felder Goal/Context, Target Audience, Narrative, KPIs, Legal. Notizen frei.
- References:
  - Artists: Suche in Mongo + Shopify, Hinzufügen/Entfernen (gespeichert unter `references.artists`).
  - Artworks: Shopify-Produkte zu ausgewähltem Shopify-Artist laden (`/api/shopify/products-by-artist`) und referenzieren.
  - Assets: Toggle S3-Medien eines DB-Artists (`/api/media?kunstlerId=…`), Upload Shopify File (`/api/shopify/files/upload`), manuelle URL-Assets. Entfernen per Klick.
- Export:
  - Lokale Generatoren bauen Proposal-Markdown (inkl. Brand-about aus `/api/brands`) und E-Mail-Entwurf. Speichern via `PATCH /api/concepts/:id` (exports).
  - Buttons: Generate/Copy/Download `.md`, E-Mail-Draft generieren/kopieren.
  - AI-Polish (Proposal/Email) via `/api/ai/concepts/generate`, Provider wird angezeigt.

## Brands (`app/admin/brands`)
- Liste lädt `/api/brands`. Detail (`app/admin/brands/[key]/BrandDetailClient.tsx`):
  - Felder: Display Name, Tone, About, Default Offer Bullets (Reihenfolge änderbar), Colors (accent/background/text), Typography (fontFamily).
  - Logos: Upload light/dark via `/api/brands/:key/logo` (FormData). Speichern per `PATCH /api/brands/:key`.
  - Brand-Daten werden u. a. im Konzept-Export genutzt (About-Text).

## UX-Notizen
- Alle Seiten arbeiten ohne Caching; bei API-Fehlern erscheinen rote Inline-Hinweise.
- Viele Aktionen (Import, Sync, Bulk) setzen kleine Erfolg-/Fehlermeldungen und refreshe die List-Daten automatisch.
- Stage-Gating bei Artists verhindert versehentliches Arbeiten in falscher Phase; Hinweis im Header erklärt Freischaltungen.

