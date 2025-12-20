"use client";

import { useEffect, useState } from "react";

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
    <div className="space-y-3">
      <div className="artist-card">
        <div className="artist-section-title">Contracts</div>
        <div className="artist-section-sub">View and download your agreements.</div>
      </div>

      {loading && <div className="artist-card artist-placeholder">Loading contracts...</div>}
      {error && <div className="artist-card artist-placeholder">Error: {error}</div>}
      {downloadError && <div className="artist-card artist-placeholder">Download error: {downloadError}</div>}

      {!loading && !error && contracts.length === 0 && (
        <div className="artist-card artist-placeholder">No contracts yet. You will see agreements here once available.</div>
      )}

      {contracts.length > 0 && (
        <div className="artist-card">
          <div className="artist-section-sub" style={{ marginBottom: 12 }}>
            Latest contracts appear first.
          </div>
          <div className="artist-grid">
            {contracts.map((c) => (
              <div key={c.id} className="artist-media-card">
                <div className="artist-section-title" style={{ fontSize: 15 }}>
                  {c.filename || "Contract"}
                </div>
                <div className="artist-chip">{c.contractType || "contract"}</div>
                <div className="text-xs text-slate-500">{c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}</div>
                <div className="artist-media-actions">
                  <button type="button" className="artist-btn-ghost" onClick={() => handleDownload(c.id)}>
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
