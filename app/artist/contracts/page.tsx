"use client";

import { useEffect, useState } from "react";
import { PageTitle } from "@/components/ui/PageTitle";
import { ApRow, ApSection, ApSectionHeader } from "@/components/artist/ApElements";

type Contract = {
  id: string;
  filename?: string;
  contractType?: string;
  createdAt?: string;
};

export default function ArtistContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const loadContracts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/artist/contracts", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as { contracts?: Contract[]; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Failed to load contracts");
      setContracts(Array.isArray(payload?.contracts) ? payload.contracts : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load contracts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const handleDownload = async (id: string) => {
    setDownloadError(null);
    try {
      const res = await fetch(`/api/artist/contracts/${encodeURIComponent(id)}/download`);
      const payload = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !payload?.url) throw new Error(payload?.error || "Download unavailable");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setDownloadError(err?.message ?? "Download failed");
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Contracts" description="View and download your agreements." />

      <ApSection>
        <ApSectionHeader title="Your contracts" subtitle="Latest first." />

        {loading && <div className="ap-note">Loading contracts...</div>}
        {error && <div className="ap-note">Error: {error}</div>}
        {downloadError && <div className="ap-note">Download error: {downloadError}</div>}

        {!loading && !error && contracts.length === 0 ? (
          <div className="ap-note">No contracts yet. You will see agreements here once available.</div>
        ) : null}

        {contracts.length > 0 && (
          <div className="ap-rows">
            {contracts.map((c) => (
              <ApRow
                key={c.id}
                title={c.filename || "Contract"}
                subtitle={c.contractType || "contract"}
                meta={
                  <>
                    <div className="ap-text-muted text-xs">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}</div>
                    <button type="button" className="ap-btn-ghost" onClick={() => handleDownload(c.id)}>
                      Download
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </ApSection>
    </div>
  );
}
