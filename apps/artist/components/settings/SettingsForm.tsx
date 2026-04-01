"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { CheckboxField } from "@/components/forms/CheckboxField";
import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";

type SettingsFormProps = {
  initialConsents: {
    allowOriginalSales: boolean;
    allowPrintSales: boolean;
    allowRental: boolean;
    allowExhibitions: boolean;
  };
};

export function SettingsForm({ initialConsents }: SettingsFormProps) {
  const [consents, setConsents] = useState(initialConsents);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function saveConsents() {
    setStatus(null);
    const res = await fetch("/api/artist/settings/consents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consents),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not save consents." });
      return;
    }
    setStatus({ tone: "success", text: "Consents updated." });
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    if (nextPassword !== confirmPassword) {
      setStatus({ tone: "error", text: "New passwords do not match." });
      return;
    }

    const res = await fetch("/api/artist/settings/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, nextPassword }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Could not change password." });
      return;
    }

    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
    setStatus({ tone: "success", text: "Password updated." });
  }

  return (
    <div className="space-y-8">
      <PageTitle title="Settings" subtitle="Update real consent values and change your password with current-password verification." />

      <Section title="Consents" subtitle="These values are saved on CanonicalArtist.">
        <div className="grid gap-3">
          <CheckboxField checked={consents.allowOriginalSales} onChange={(checked) => setConsents({ ...consents, allowOriginalSales: checked })} label="Allow original sales" />
          <CheckboxField checked={consents.allowPrintSales} onChange={(checked) => setConsents({ ...consents, allowPrintSales: checked })} label="Allow print sales" />
          <CheckboxField checked={consents.allowRental} onChange={(checked) => setConsents({ ...consents, allowRental: checked })} label="Allow rental" />
          <CheckboxField checked={consents.allowExhibitions} onChange={(checked) => setConsents({ ...consents, allowExhibitions: checked })} label="Allow exhibitions" />
        </div>
        <Button type="button" onClick={() => void saveConsents()}>
          Save consents
        </Button>
      </Section>

      <Section title="Password" subtitle="Current password is required before a new password can be saved.">
        <form className="space-y-4" onSubmit={changePassword}>
          <Input label="Current password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          <Input label="New password" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} autoComplete="new-password" />
          <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
          <Button type="submit">Change password</Button>
        </form>
      </Section>

      <Section title="Session" subtitle="Sign out of the artist workspace.">
        <Button type="button" tone="secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </Section>

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}
    </div>
  );
}
