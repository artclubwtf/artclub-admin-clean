"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
      <div className="artist-card">
        <div className="artist-section-title">Payout</div>
        <div className="artist-section-sub">View your payout information. To change details, submit a request.</div>
      </div>

      {loading && <div className="artist-card artist-placeholder">Loading payout...</div>}
      {error && <div className="artist-card artist-placeholder">Error: {error}</div>}

      {!loading && !error && (
        <>
          <div className="artist-card space-y-2">
            {hasData ? (
              <>
                <div className="artist-section-title">Current details</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <InfoRow label="Account holder" value={payout?.accountHolder} />
                  <InfoRow label="IBAN" value={payout?.iban} />
                  <InfoRow label="BIC" value={payout?.bic} />
                  <InfoRow label="Bank name" value={payout?.bankName} />
                  <InfoRow label="Address" value={payout?.address} />
                  <InfoRow label="Tax ID" value={payout?.taxId} />
                </div>
                {payout?.updatedAt && (
                  <div className="text-xs text-slate-500">Last updated {new Date(payout.updatedAt).toLocaleString()}</div>
                )}
              </>
            ) : (
              <div className="artist-placeholder">No payout details yet.</div>
            )}
          </div>

          <div className="artist-card space-y-2">
            <div className="artist-section-title">Request change</div>
            <div className="artist-section-sub">
              You cannot edit payout data directly. Submit a change request and the team will review it.
            </div>
            <Link href="/artist/payout/request" className="artist-btn" style={{ display: "inline-flex", width: "fit-content" }}>
              Request change
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-white/60 p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value || "—"}</div>
    </div>
  );
}
