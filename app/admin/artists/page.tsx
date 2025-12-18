import { fetchKuenstler } from "@/lib/shopify";
import ArtistsPageClient from "./ArtistsPageClient";

export default async function ArtistsPage() {
  const artists = await fetchKuenstler();

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artists</h1>
        <p className="text-sm text-slate-600">Browse artists from Shopify metaobjects.</p>
      </header>

      <ArtistsPageClient artists={artists} />
    </main>
  );
}
