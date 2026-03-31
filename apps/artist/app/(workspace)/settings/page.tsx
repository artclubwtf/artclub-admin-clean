import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Settings"
        subtitle="Account, notification and workspace preferences will live here once auth and profile state are wired."
      />

      <Section title="Workspace" subtitle="Reserved for account-level controls and future sign-out flow.">
        <div className="grid gap-3">
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Notification settings</div>
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Security and password management</div>
          <div className="rounded-3xl bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">Publishing preferences and consent controls</div>
        </div>
      </Section>

      <Button type="button" tone="secondary">
        Sign out
      </Button>
    </div>
  );
}
