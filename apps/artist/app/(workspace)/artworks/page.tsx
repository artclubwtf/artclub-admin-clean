import Link from "next/link";

import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import { requireArtistContext } from "@/lib/server/artist-context";
import { CanonicalProductModel } from "@/lib/server/models";
import { artistProductOwnershipFilter } from "@/lib/server/product-ownership";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ArtworksPage() {
  const context = await requireArtistContext();
  const artworks = await CanonicalProductModel.find({
    ...artistProductOwnershipFilter(context),
    type: "artwork",
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  return (
    <div className="space-y-8">
      <PageTitle
        title="Artworks"
        subtitle="Real artwork records from CanonicalProduct, scoped to the current artist."
        action={<Button href="/artworks/new">New</Button>}
      />

      <Section title="Artwork pipeline" subtitle={`${artworks.length} artwork${artworks.length === 1 ? "" : "s"}`}>
        <div className="space-y-3">
          {artworks.length ? (
            artworks.map((item) => (
              <Link key={item.productKey} href={`/artworks/${encodeURIComponent(item.productKey)}`} className="flex items-center gap-4 rounded-[1.75rem] bg-neutral-50 p-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.images?.thumbUrl || item.images?.mediumUrl || item.images?.originalUrl || "/"} alt={item.title} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-base font-semibold tracking-[-0.02em] text-neutral-950">{item.title}</div>
                  <div className="text-sm text-neutral-500">
                    {item.status} · {item.forSale !== false ? "for sale" : "not for sale"} · {item.originalAvailable ? "original" : "no original"} · {item.allowPrints ? "prints" : "no prints"}
                  </div>
                  {item.seriesName ? <div className="text-sm text-neutral-500">{item.seriesName}</div> : null}
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No artworks yet.</div>
          )}
        </div>
      </Section>
    </div>
  );
}
