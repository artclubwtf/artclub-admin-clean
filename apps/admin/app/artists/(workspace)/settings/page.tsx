"use client";

import { FormEvent, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

import PageShell from "@/app/artists/_components/PageShell";
import SectionCard from "@/app/artists/_components/SectionCard";

type Consents = {
  allowOriginalSales: boolean;
  allowPrintSales: boolean;
  allowRental: boolean;
  allowExhibitions: boolean;
  presentationOnly: boolean;
};

type MePayload = {
  ok: boolean;
  me: {
    email: string;
    artistKey: string;
    onboardingComplete: boolean;
  };
};

export default function ArtistsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingConsents, setSavingConsents] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [consents, setConsents] = useState<Consents>({
    allowOriginalSales: false,
    allowPrintSales: false,
    allowRental: false,
    allowExhibitions: false,
    presentationOnly: false,
  });
  const [email, setEmail] = useState("");
  const [artistKey, setArtistKey] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashboardRes, meRes] = await Promise.all([
          fetch("/api/artists/v2/dashboard", { cache: "no-store" }),
          fetch("/api/artists/v3/me", { cache: "no-store" }),
        ]);

        const dashboardPayload = (await dashboardRes.json().catch(() => null)) as
          | { artist?: { consents?: Consents }; error?: string }
          | null;
        if (!dashboardRes.ok) throw new Error(dashboardPayload?.error || "Failed to load consents");

        const mePayload = (await meRes.json().catch(() => null)) as MePayload | { error?: string } | null;
        if (!meRes.ok) throw new Error((mePayload as { error?: string } | null)?.error || "Failed to load settings");

        if (active) {
          setConsents(
            dashboardPayload?.artist?.consents || {
              allowOriginalSales: false,
              allowPrintSales: false,
              allowRental: false,
              allowExhibitions: false,
              presentationOnly: false,
            },
          );
          setEmail((mePayload as MePayload).me.email || "");
          setArtistKey((mePayload as MePayload).me.artistKey || "");
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load settings");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const saveConsents = async () => {
    setSavingConsents(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artists/v2/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consents),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to save consents");
      setMessage("Consents updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to save consents");
    } finally {
      setSavingConsents(false);
    }
  };

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSavingPassword(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to change password");
      setPassword("");
      setMessage("Password updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <PageShell title="Settings" subtitle="Consents, account and workspace status">
      {error ? <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Loading settings…</div> : null}

      {!loading ? (
        <div className="grid gap-4">
          <SectionCard title="Consents" subtitle="Update permissions and collaboration preferences">
            <div className="grid gap-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowOriginalSales}
                  onChange={(e) => setConsents((prev) => ({ ...prev, allowOriginalSales: e.target.checked }))}
                />
                Sell originals (30% ARTCLUB)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowPrintSales}
                  onChange={(e) => setConsents((prev) => ({ ...prev, allowPrintSales: e.target.checked }))}
                />
                Sell prints/editions (artist receives 40% license fee)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowRental}
                  onChange={(e) => setConsents((prev) => ({ ...prev, allowRental: e.target.checked }))}
                />
                Rent artworks (30% ARTCLUB on artwork fee)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.allowExhibitions}
                  onChange={(e) => setConsents((prev) => ({ ...prev, allowExhibitions: e.target.checked }))}
                />
                Exhibition inquiries allowed
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consents.presentationOnly}
                  onChange={(e) => setConsents((prev) => ({ ...prev, presentationOnly: e.target.checked }))}
                />
                Presentation-only profile
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button className="btnPrimary" type="button" onClick={saveConsents} disabled={savingConsents}>
                {savingConsents ? "Saving..." : "Save consents"}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Account" subtitle="Change your password and manage session">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={onChangePassword}>
              <label className="field">
                Email
                <input value={email} readOnly />
              </label>
              <label className="field">
                Artist key
                <input value={artistKey} readOnly />
              </label>
              <label className="field md:col-span-2">
                New password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
              </label>
              <div className="md:col-span-2 flex justify-between gap-2">
                <button className="btnGhost" type="button" onClick={() => signOut({ callbackUrl: "/artists/login" })}>
                  Logout
                </button>
                <button className="btnPrimary" type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating..." : "Change password"}
                </button>
              </div>
            </form>
          </SectionCard>
        </div>
      ) : null}
    </PageShell>
  );
}
