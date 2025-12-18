import ArtistsPageClient from "./ArtistsPageClient";

export default function ArtistsPage() {
  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artists</h1>
        <p className="text-sm text-slate-600">Create and manage artists.</p>
      </header>

      <ArtistsPageClient />
    </main>
  );
}
