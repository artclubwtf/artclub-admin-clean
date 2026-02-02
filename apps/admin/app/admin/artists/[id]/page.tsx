import ArtistDetailClient from "./ArtistDetailClient";

export default async function ArtistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artist</h1>
        <p className="text-sm text-slate-600">View and edit artist details.</p>
      </header>

      <ArtistDetailClient artistId={id} />
    </main>
  );
}
