# Artclub Admin – Leitfaden für Mitarbeitende (ohne Technik)

Diese Anleitung erklärt Schritt für Schritt, wie du den Admin nutzen kannst, ohne technisches Vorwissen zu brauchen. Wenn etwas nicht funktioniert, zuerst die Seite neu laden. Bei Fehlermeldungen rot markierte Hinweise lesen; sie sagen dir, was fehlt.

## Start & Navigation
- Admin öffnest du über `/admin`. Links in der Leiste findest du: Dashboard, Artists, Orders, Analytics, Products, Concepts, Brands.
- Jeder Bereich lädt live-Daten. Wenn du etwas änderst, kurz warten und bei Bedarf neu laden.

## Dashboard
- Zeigt Kacheln zu offenen Aufgaben (z. B. fehlende Verträge, offene Payouts) und Verkaufszahlen heute/letzte 7 Tage.
- Ein Klick auf eine Kachel führt dich direkt zur passenden Liste mit Filter (z. B. Artists ohne Vertrag).

## Artists (Künstler verwalten)
### Übersicht
- Liste aller Künstler. Oben: Suche, Stage-Filter (Idea, In Review, Offer, Under Contract).
- Button „New artist“ legt einen neuen Künstler mit Name/optional Kontakt an.
- Shopify-Künstler ohne Link erscheinen mit Badge „Shopify“ und können per „Import“ übernommen werden.

### Detailansicht eines Künstlers
- Oben: Stage auswählen, „Save“ speichert die aktuellen Eingaben, „Sync to Shopify“ schickt fertige Daten zu Shopify (nur wenn Stage „Under Contract“ und Profil vollständig).
- Tabs (werden je nach Stage freigeschaltet):
  - **Overview**: Name, Email, Telefon, interne Notizen. Nach Änderungen „Save“ klicken.
  - **Media**: Dateien/Bilder hochladen. Du kannst Hero Image setzen oder Dateien löschen.
  - **Artworks**: Nur wenn mit Shopify verknüpft. Bilder auswählen und „Create in Shopify“ für einen Entwurf oder „Bulk create drafts“ für mehrere Entwürfe.
  - **Contracts**: Provisionen eintragen, PDF hochladen (Typ wählen), Speichern.
  - **Public Profile**: Öffentliche Infos (Name, Texte, Zitate), Kategorie wählen, Bilder hochladen. Erst wenn Name + Text + Bild vorhanden sind, kannst du zu Shopify syncen.
  - **Payout**: Bankdaten/Steuer-ID speichern. Mit „Record payout“ eine Auszahlung erfassen.
  - **Orders**: Umsätze und offene Beträge des Künstlers ansehen.
- Hinweis-Badges zeigen dir pro Bereich, ob noch etwas fehlt („missing“) oder schon erledigt („ready“).

## Orders (Bestellungen & POS)
- Filter oben: Quelle (Shopify/POS), Zeitraum, Paid/Cancelled, Artist, „Unassigned“ für nicht zugeordnete Positionen.
- **Import from Shopify**: holt neue Online-Bestellungen (max. 25 auf einmal).
- **New POS order**: Öffnet ein Formular für Ladenverkäufe. Pro Zeile Titel, Menge, Preis, Sale Type (Print/Original/Unknown) und Artist auswählen. Speichern legt die POS-Bestellung an.
- Klick auf eine Zeile öffnet Details. Dort kannst du einzelne Positionen bearbeiten (Artist/Sale Type/Gross) und speichern.

## Analytics
- Oben zwei Reiter: **Sales** (Shopify/POS-Umsätze) und **Web** (GA4-Webdaten).
- Sales: Zeitraum wählen (7/30/90 Tage). Siehst Umsätze, Bestellungen, AOV sowie Top-Länder/Städte.
- Web: Start-/End-Datum wählen, optional „Compare“. Zeigt Active/New Users, Sessions, Engagement Rate sowie Top-Länder/Städte/Devices/Traffic Sources. „Not configured“ bedeutet: GA4-Zugang fehlt (an Tech-Team melden).
- „Refresh“ lädt die aktuellen Daten neu.

## Products
- Zeigt eine einfache Liste der letzten Shopify-Produkte. Dient nur zur schnellen Sichtprüfung.

## Concepts (Konzepte für Kunden)
### Liste
- Filter nach Brand (artclub/alea), Typ (sponsoring/leasing/event), Status (draft … won/lost), Suche im Titel. „New Concept“ legt ein neues Konzept an.

### Neues Konzept
- Titel, Brand, Typ, Granularität wählen und speichern. Du wirst automatisch in die Detailansicht geleitet.

### Konzept-Detail
- Abschnitt „Basics“: Titel, Status, Granularität; „Save“ sichert alles.
- „Content“: Ziel/Kontext, Zielgruppe, Story, KPIs, Legal, Notizen ausfüllen.
- „Assets & References“: Künstler (aus DB oder Shopify) und Artworks verknüpfen; Medien/Dateien als Assets anhängen (Uploads oder vorhandene Medien).
- „Export“: 
  - Proposal-Text oder E-Mail-Entwurf generieren (Buttons „Generate“), kopieren oder als Markdown herunterladen.
  - „AI Polish“ optimiert Text automatisch. Wenn etwas nicht passt, erneut generieren oder manuell anpassen.
- „Export as PDF“-Button druckt das Konzept.

## Brands
- Liste zeigt ARTCLUB und ALÉA. „Edit“ öffnet Details.
- In der Detailansicht: Namen, Tonalität, Beschreibung, Standard-Bullets, Farben, Schrift speichern. Logos für hell/dunkel hochladen. „Save“ übernimmt die Änderungen.

## Tipps bei Problemen
- Seite neu laden, dann erneut versuchen.
- Prüfen, ob Pflichtfelder (mit Sternchen/Hinweis) ausgefüllt sind.
- Bei Fehlermeldungen im roten Text steht, was fehlt (z. B. Preis eingeben, Bild wählen).
- Wenn Shopify/GA4 als „not configured“ erscheint, an das Tech-Team weitergeben.
