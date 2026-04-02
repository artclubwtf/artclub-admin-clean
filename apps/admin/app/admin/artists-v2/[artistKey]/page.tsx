import { notFound } from "next/navigation";

import { loadAdminArtistV2Detail } from "@/lib/adminArtistsV2";
import ArtistV2DetailClient from "./ArtistV2DetailClient";

export default async function ArtistV2DetailPage({ params }: { params: Promise<{ artistKey: string }> }) {
  const { artistKey } = await params;
  const detail = await loadAdminArtistV2Detail(artistKey);

  if (!detail) {
    notFound();
  }

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Artist detail</h1>
        <p className="text-sm text-slate-600">Canonical artist operations with legacy bridge visibility.</p>
      </header>

      <ArtistV2DetailClient initialDetail={detail} />
    </main>
  );
}
