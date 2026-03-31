import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function MediaPage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Media"
        subtitle="A clean home for profile and artwork assets. Upload, organization and reuse will be added here without bringing over the old admin media UI."
      />

      <Section title="Library" subtitle="Prepared for a lightweight, mobile-first media workflow.">
        <div className="space-y-3">
          <div className="rounded-3xl bg-neutral-50 px-4 py-5 text-sm leading-6 text-neutral-600">
            Upload and ingestion will connect to admin-owned storage endpoints.
          </div>
          <div className="rounded-3xl bg-neutral-50 px-4 py-5 text-sm leading-6 text-neutral-600">
            Image selection for profile, hero and artwork assignment will live in the same surface.
          </div>
        </div>
      </Section>

      <Button type="button" tone="secondary">
        Upload coming next
      </Button>
    </div>
  );
}
