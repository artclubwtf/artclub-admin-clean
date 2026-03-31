import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

const artworkStates = [
  "New draft creation lives here without exposing direct Shopify editing.",
  "Listings will be sourced from CanonicalProduct and CanonicalVariant via admin APIs.",
  "Status, review and publication flow can expand here without changing the navigation model.",
];

export default function ArtworksPage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Artworks"
        subtitle="Minimal workspace for artwork management. Built to stay close to canonical product data while keeping the frontend quiet and focused."
        action={<Button href="/artworks/new">New</Button>}
      />

      <Section title="Artwork pipeline" subtitle="Skeleton only for now, no business logic yet.">
        <div className="space-y-3">
          {artworkStates.map((item) => (
            <div key={item} className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">
              {item}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
