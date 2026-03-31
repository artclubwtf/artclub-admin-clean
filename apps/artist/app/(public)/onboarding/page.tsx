import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function OnboardingPage() {
  return (
    <div className="space-y-8 pb-8">
      <PageTitle
        title="Onboarding"
        subtitle="Early onboarding shell for artist identity, profile and publishing intent. The final flow will persist through admin-owned APIs and canonical models."
      />

      <Section title="Identity" subtitle="Collect the basics before profile and artwork setup.">
        <div className="space-y-4">
          <Input label="Display name" placeholder="Your public artist name" />
          <Input label="Handle" placeholder="artist-handle" />
          <Input label="City" placeholder="Berlin" />
        </div>
      </Section>

      <Section title="Publishing intent" subtitle="Keep scope narrow and extend later without redesigning the layout.">
        <div className="grid gap-3">
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Originals, prints and rental preferences will live here.</div>
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Profile imagery and bio completion will follow as the next step.</div>
        </div>
      </Section>

      <Button type="button" className="w-full">
        Continue onboarding
      </Button>
    </div>
  );
}
