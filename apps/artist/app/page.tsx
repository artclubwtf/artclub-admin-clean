import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

const foundationItems = [
  "CanonicalArtist remains the profile source through admin-owned APIs.",
  "CanonicalProduct drives artwork listing and draft workflow.",
  "CanonicalVariant stays behind the same backend boundary for edition data.",
];

const launchAreas = ["Onboarding flow", "Artwork creation", "Media library", "Profile publishing"];

export default function HomePage() {
  return (
    <WorkspaceShell>
      <div className="space-y-8">
        <PageTitle
          title="Home"
          subtitle="A quiet starting point for the new artist product. This app is intentionally minimal, mobile-first and ready for auth, onboarding and workspace logic."
          action={<Button href="/artworks/new">New artwork</Button>}
        />

        <Section
          title="Product foundation"
          subtitle="The frontend stays clean while admin remains the backend and integration hub."
        >
          <div className="space-y-3 text-sm leading-6 text-neutral-600">
            {foundationItems.map((item) => (
              <div key={item} className="rounded-3xl bg-neutral-50 px-4 py-4">
                {item}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Now in scope" subtitle="These are the first surfaces prepared in the new workspace.">
          <div className="grid gap-3 sm:grid-cols-2">
            {launchAreas.map((item) => (
              <div key={item} className="rounded-3xl bg-neutral-50 px-4 py-5 text-sm font-medium text-neutral-700">
                {item}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </WorkspaceShell>
  );
}
