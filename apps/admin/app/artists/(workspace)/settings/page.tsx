"use client";

import { FormEvent, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

import ui from "../workspace-ui.module.css";

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
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
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div>
      {error ? <div className={ui.error}>{error}</div> : null}
      {message ? <div className={ui.success}>{message}</div> : null}
      {loading ? <div className={ui.muted}>Loading settings...</div> : null}

      {loading === false ? (
        <div className={ui.inputRow}>
          <div className={ui.pageIntro}>
            <div className={ui.pageTitle}>Settings</div>
            <div className={ui.pageSub}>Manage your account and preferences</div>
          </div>

          <div className={ui.panel}>
            <div className={ui.cardTitle}>Consents</div>
            <div className={ui.pageSub}>Control how ARTCLUB can work with your artworks</div>

            <div className={ui.settingsGroup} style={{ marginTop: 10 }}>
              <div className={ui.settingsRow}>
                <div>
                  <div className={ui.settingsTitle}>ARTCLUB may sell my originals</div>
                  <div className={ui.settingsSub}>30% platform fee on sales</div>
                </div>
                <label className={`${ui.switch} ${consents.allowOriginalSales ? ui.switchOn : ""}`.trim()}>
                  <input
                    type="checkbox"
                    checked={consents.allowOriginalSales}
                    onChange={(e) => setConsents((prev) => ({ ...prev, allowOriginalSales: e.target.checked }))}
                  />
                </label>
              </div>

              <div className={ui.settingsRow}>
                <div>
                  <div className={ui.settingsTitle}>ARTCLUB may sell prints/editions</div>
                  <div className={ui.settingsSub}>Artist gets 40% license fee</div>
                </div>
                <label className={`${ui.switch} ${consents.allowPrintSales ? ui.switchOn : ""}`.trim()}>
                  <input
                    type="checkbox"
                    checked={consents.allowPrintSales}
                    onChange={(e) => setConsents((prev) => ({ ...prev, allowPrintSales: e.target.checked }))}
                  />
                </label>
              </div>

              <div className={ui.settingsRow}>
                <div>
                  <div className={ui.settingsTitle}>ARTCLUB may rent my artworks</div>
                  <div className={ui.settingsSub}>30% platform fee on rental fees</div>
                </div>
                <label className={`${ui.switch} ${consents.allowRental ? ui.switchOn : ""}`.trim()}>
                  <input
                    type="checkbox"
                    checked={consents.allowRental}
                    onChange={(e) => setConsents((prev) => ({ ...prev, allowRental: e.target.checked }))}
                  />
                </label>
              </div>

              <div className={ui.settingsRow}>
                <div>
                  <div className={ui.settingsTitle}>ARTCLUB may contact me for exhibitions</div>
                  <div className={ui.settingsSub}>We&apos;ll reach out with opportunities</div>
                </div>
                <label className={`${ui.switch} ${consents.allowExhibitions ? ui.switchOn : ""}`.trim()}>
                  <input
                    type="checkbox"
                    checked={consents.allowExhibitions}
                    onChange={(e) => setConsents((prev) => ({ ...prev, allowExhibitions: e.target.checked }))}
                  />
                </label>
              </div>

              <div className={ui.settingsRow}>
                <div>
                  <div className={ui.settingsTitle}>Presentation-only profile</div>
                  <div className={ui.settingsSub}>Showcase only, no sales</div>
                </div>
                <label className={`${ui.switch} ${consents.presentationOnly ? ui.switchOn : ""}`.trim()}>
                  <input
                    type="checkbox"
                    checked={consents.presentationOnly}
                    onChange={(e) => setConsents((prev) => ({ ...prev, presentationOnly: e.target.checked }))}
                  />
                </label>
              </div>
            </div>

            <div className={ui.rowActions} style={{ marginTop: 12 }}>
              <button className="btnPrimary" type="button" onClick={saveConsents} disabled={savingConsents}>
                {savingConsents ? "Saving..." : "Save consents"}
              </button>
            </div>
          </div>

          <div className={ui.panel}>
            <div className={ui.cardTitle}>Account</div>
            <div className={ui.pageSub}>Status: active · {artistKey || "—"}</div>

            <form className={ui.inputRow} style={{ marginTop: 10 }} onSubmit={onChangePassword}>
              <label className={ui.inputField}>
                Email
                <input value={email} readOnly />
              </label>
              <label className={ui.inputField}>
                Current password
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </label>
              <label className={ui.inputField}>
                New password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
              </label>
              <label className={ui.inputField}>
                Confirm new password
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} />
              </label>

              <div className={ui.rowActions}>
                <button className="btnPrimary" type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating..." : "Update password"}
                </button>
                <button className={ui.btnDanger} type="button" onClick={() => signOut({ callbackUrl: "/artists/login" })}>
                  Logout
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
