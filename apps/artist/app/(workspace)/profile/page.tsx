import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function ProfilePage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Profile"
        subtitle="Quiet profile editing surface built around CanonicalArtist, with room for review workflows and later public artist pages."
      />

      <Section title="Public identity" subtitle="The essentials for the first profile pass.">
        <div className="space-y-4">
          <Input label="Display name" placeholder="Artist name" />
          <Input label="Handle" placeholder="artist-handle" />
          <Input label="Location" placeholder="Berlin, Germany" />
        </div>
      </Section>

      <Section title="Narrative" subtitle="Longer-form text and profile media can grow here without changing the page rhythm.">
        <div className="rounded-[2rem] bg-neutral-50 px-4 py-5 text-sm leading-6 text-neutral-600">
          Bio, statement, links and image selection will be added in this section once the API contract is defined.
        </div>
      </Section>

      <Button type="button">Save profile draft</Button>
    </div>
  );
}
