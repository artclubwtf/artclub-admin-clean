"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ApSection, ApSectionHeader } from "@/components/artist/ApElements";

type Payout = {
  accountHolder?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  address?: string;
  taxId?: string;
  updatedAt?: string;
};

export default function ArtistPayoutPage() {
  const [payout, setPayout] = useState<Payout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/artist/payout", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { payout?: Payout | null; error?: string } | null;
        if (!res.ok) throw new Error(payload?.error || "Failed to load payout");
        if (!active) return;
        setPayout(payload?.payout ?? null);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load payout");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const hasData = useMemo(() => {
    if (!payout) return false;
    return Object.values(payout).some((v) => v);
  }, [payout]);

  return (
    <div className="space-y-4">
      <ApSection>
        <ApSectionHeader
          title="Payout"
          subtitle="View your payout information. To change details, submit a request."
        />
      </ApSection>

      {loading && <div className="ap-note">Loading payout...</div>}
      {error && <div className="ap-note">Error: {error}</div>}

      {!loading && !error && (
        <>
          <ApSection>
            <ApSectionHeader title="Current details" subtitle="Latest saved bank and tax info" />
            {hasData ? (
              <>
                <div className="ap-form-grid">
                  <InfoRow label="Account holder" value={payout?.accountHolder} />
                  <InfoRow label="IBAN" value={payout?.iban} />
                  <InfoRow label="BIC" value={payout?.bic} />
                  <InfoRow label="Bank name" value={payout?.bankName} />
                  <InfoRow label="Address" value={payout?.address} />
                  <InfoRow label="Tax ID" value={payout?.taxId} />
                </div>
                {payout?.updatedAt && (
                  <div className="ap-text-muted text-xs">Last updated {new Date(payout.updatedAt).toLocaleString()}</div>
                )}
              </>
            ) : (
              <div className="ap-note">No payout details yet.</div>
            )}
          </ApSection>

          <ApSection>
            <ApSectionHeader
              title="Request change"
              subtitle="Submit updates and the team will review them for you."
              action={
                <Link href="/artist/payout/request" className="ap-btn">
                  Request change
                </Link>
              }
            />
            <div className="ap-note">You cannot edit payout data directly.</div>
          </ApSection>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="ap-field">
      <label>{label}</label>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value || "—"}</div>
    </div>
  );
}
