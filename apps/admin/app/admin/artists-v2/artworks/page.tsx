import { loadProductMatchingOverview } from "@/lib/migration/matching";
import ArtworkMatchingClient from "./ArtworkMatchingClient";

export default async function ArtworkMatchingPage() {
  const data = await loadProductMatchingOverview();

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artwork Matching</h1>
        <p className="text-sm text-slate-600">
          Match imported canonical artworks to the correct artist and write the relevant backend fields directly onto the artwork record.
        </p>
      </header>

      <ArtworkMatchingClient initialProducts={data.products} artistOptions={data.artistOptions} />
    </main>
  );
}
