import { loadAdminArtistsV2Overview } from "@/lib/adminArtistsV2";
import ArtistsV2Client from "./ArtistsV2Client";

export default async function ArtistsV2Page() {
  const artists = await loadAdminArtistsV2Overview();

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artistzentrale</h1>
        <p className="text-sm text-slate-600">Canonical-first artist operations with matching, legacy bridges and sync control in one place.</p>
      </header>

      <ArtistsV2Client initialArtists={artists} />
    </main>
  );
}
