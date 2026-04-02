import { loadAdminArtistsV2Meta, loadAdminArtistsV2Overview, loadAdminArtistsV2SyncQueue } from "@/lib/adminArtistsV2";
import ArtistsV2Client from "./ArtistsV2Client";

export default async function ArtistsV2Page() {
  const [artists, meta, syncQueue] = await Promise.all([
    loadAdminArtistsV2Overview(),
    loadAdminArtistsV2Meta(),
    loadAdminArtistsV2SyncQueue(),
  ]);

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artistzentrale</h1>
        <p className="text-sm text-slate-600">Canonical-first artist operations with matching, legacy bridges and sync control in one place.</p>
      </header>

      <ArtistsV2Client initialArtists={artists} meta={meta} initialSyncQueue={syncQueue} />
    </main>
  );
}
