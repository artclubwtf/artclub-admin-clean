import ArtistsPageClient from "./ArtistsPageClient";

export default function ArtistsPage() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Artists</h1>
          <p className="text-sm text-slate-600">Manage internal artist pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/artists/keys" className="inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Artist Keys
          </a>
          <a
            href="/admin/artists/new"
            className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            New artist
          </a>
        </div>
      </header>

      <ArtistsPageClient />
    </main>
  );
}
