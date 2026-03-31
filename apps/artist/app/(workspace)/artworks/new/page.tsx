import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function NewArtworkPage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="New artwork"
        subtitle="Prepared for a clean creation flow that feeds canonical product records through the admin API layer."
        action={
          <Button href="/artworks" tone="secondary">
            Back
          </Button>
        }
      />

      <Section title="Core details" subtitle="Simple input structure first, no save logic wired yet.">
        <div className="space-y-4">
          <Input label="Title" placeholder="Artwork title" />
          <Input label="Year" placeholder="2026" inputMode="numeric" />
          <Input label="Medium" placeholder="Oil on linen" />
          <Input label="Dimensions" placeholder="100 x 120 cm" />
        </div>
      </Section>

      <Section title="Media and editions" subtitle="Future media selection and variant creation can slot in here.">
        <div className="grid gap-3">
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Attach artwork media from the shared media library.</div>
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Prepare original, print or edition settings without leaking Shopify concerns into the artist UI.</div>
        </div>
      </Section>

      <Button type="button" className="w-full">
        Save draft
      </Button>
    </div>
  );
}
