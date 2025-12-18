"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { ShopifyKuenstler } from "@/lib/shopify";

type Props = {
  artistId: string;
};

type ArtistProduct = {
  id: string;
  title: string;
  handle: string;
  featuredImage: string | null;
};

type Contract = {
  _id?: string;
  kunstlerId: string;
  contractType: string;
  filename?: string;
  s3Key: string;
  s3Url?: string;
  mimeType?: string;
  sizeBytes?: number;
  signedAt?: string;
  createdAt?: string;
};

type PayoutDetails = {
  kunstlerId: string;
  accountHolder?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  address?: string;
  taxId?: string;
};

function parseErrorMessage(payload: any) {
  if (!payload) return "Unexpected error";
  if (typeof payload === "string") return payload;
  if (payload.error) {
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
  }
  return "Unexpected error";
}

export default function ArtistDetailClient({ artistId }: Props) {
  const [artist, setArtist] = useState<ShopifyKuenstler | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [quote, setQuote] = useState("");
  const [einleitung1, setEinleitung1] = useState("");
  const [text1, setText1] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<ArtistProduct[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractType, setContractType] = useState("artist_contract");
  const [contractSignedAt, setContractSignedAt] = useState("");
  const [uploadingContract, setUploadingContract] = useState(false);
  const [uploadContractMessage, setUploadContractMessage] = useState<string | null>(null);
  const [uploadContractError, setUploadContractError] = useState<string | null>(null);

  const [payout, setPayout] = useState<PayoutDetails | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutSaveMessage, setPayoutSaveMessage] = useState<string | null>(null);
  const [accountHolder, setAccountHolder] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}`, { cache: "no-store" });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        const data = json.artist as ShopifyKuenstler;
        setArtist(data);
        setName(data.name ?? "");
        setInstagram(data.instagram ?? "");
        setQuote(data.quote ?? "");
        setEinleitung1(data.einleitung_1 ?? "");
        setText1(data.text_1 ?? "");
        setProducts(Array.isArray(json.products) ? json.products : []);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load artist");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [artistId]);

  useEffect(() => {
    let active = true;
    const loadContracts = async () => {
      setContractsLoading(true);
      setContractsError(null);
      try {
        const res = await fetch(`/api/contracts?kunstlerId=${encodeURIComponent(artistId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        setContracts(Array.isArray(json.contracts) ? json.contracts : []);
      } catch (err: any) {
        if (!active) return;
        setContractsError(err?.message ?? "Failed to load contracts");
      } finally {
        if (active) setContractsLoading(false);
      }
    };

    const loadPayout = async () => {
      setPayoutLoading(true);
      setPayoutError(null);
      try {
        const res = await fetch(`/api/payout?kunstlerId=${encodeURIComponent(artistId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        const details = json.payout as PayoutDetails | null;
        setPayout(details);
        setAccountHolder(details?.accountHolder ?? "");
        setIban(details?.iban ?? "");
        setBic(details?.bic ?? "");
        setBankName(details?.bankName ?? "");
        setAddress(details?.address ?? "");
        setTaxId(details?.taxId ?? "");
      } catch (err: any) {
        if (!active) return;
        setPayoutError(err?.message ?? "Failed to load payout details");
      } finally {
        if (active) setPayoutLoading(false);
      }
    };

    loadContracts();
    loadPayout();
    return () => {
      active = false;
    };
  }, [artistId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          instagram: instagram.trim(),
          quote: quote.trim(),
          einleitung_1: einleitung1.trim(),
          text_1: text1.trim(),
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }

      const json = await res.json();
      const updated = json.artist as ShopifyKuenstler;
      setArtist(updated);
      setSaveMessage("Saved");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save artist");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadContract = async (e: FormEvent) => {
    e.preventDefault();
    setUploadContractError(null);
    setUploadContractMessage(null);
    if (!contractFile) {
      setUploadContractError("Bitte eine PDF auswählen.");
      return;
    }

    setUploadingContract(true);
    try {
      const formData = new FormData();
      formData.append("file", contractFile);
      formData.append("kunstlerId", artistId);
      formData.append("contractType", contractType);
      if (contractSignedAt.trim()) formData.append("signedAt", contractSignedAt.trim());

      const res = await fetch("/api/contracts/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }

      const json = await res.json();
      setContracts((prev) => [json.contract, ...prev]);
      setUploadContractMessage("Upload erfolgreich");
      setContractFile(null);
      setContractSignedAt("");
    } catch (err: any) {
      setUploadContractError(err?.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploadingContract(false);
    }
  };

  const handleSavePayout = async (e: FormEvent) => {
    e.preventDefault();
    setPayoutError(null);
    setPayoutSaveMessage(null);
    setPayoutSaving(true);
    try {
      const res = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kunstlerId: artistId,
          accountHolder: accountHolder.trim() || undefined,
          iban: iban.trim() || undefined,
          bic: bic.trim() || undefined,
          bankName: bankName.trim() || undefined,
          address: address.trim() || undefined,
          taxId: taxId.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }

      const json = await res.json();
      setPayout(json.payout);
      setPayoutSaveMessage("Payout gespeichert");
    } catch (err: any) {
      setPayoutError(err?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setPayoutSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading artist...</p>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Error: {error}</p>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Artist not found.</p>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>
    );
  }

  const readonlyFields = [
    { label: "Handle", value: artist.handle },
    { label: "Bilder (file_reference)", value: artist.bilder },
    { label: "Bild 1 (file_reference)", value: artist.bild_1 },
    { label: "Bild 2 (file_reference)", value: artist.bild_2 },
    { label: "Bild 3 (file_reference)", value: artist.bild_3 },
    { label: "Kategorie", value: artist.kategorie },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">ID</div>
          <div className="font-mono text-sm text-slate-700 break-all">{artist.id}</div>
        </div>
        <Link href="/admin/artists" className="text-sm text-blue-600 underline">
          Back to artists
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Name"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Instagram
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="@handle"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Quote
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Quote"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Einleitung 1
          <textarea
            value={einleitung1}
            onChange={(e) => setEinleitung1(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Einleitung"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Text 1
          <textarea
            value={text1}
            onChange={(e) => setText1(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Text"
          />
        </label>

        {error && <p className="text-sm text-red-600">Error: {error}</p>}
        {saveMessage && <p className="text-sm text-green-600">{saveMessage}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Read-only fields</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {readonlyFields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="text-sm text-slate-700 break-all">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Products (Kategorie)</h3>
          {artist.kategorie && (
            <span className="text-xs text-slate-500">Collection: {artist.kategorie}</span>
          )}
        </div>
        {!artist.kategorie && <p className="text-sm text-slate-600">No category linked.</p>}
        {artist.kategorie && products.length === 0 && (
          <p className="text-sm text-slate-600">No products found for this category.</p>
        )}
        {artist.kategorie && products.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {products.map((product) => (
              <li key={product.id} className="flex gap-3 rounded border border-slate-200 p-3">
            {product.featuredImage && (
              <img
                src={product.featuredImage}
                alt={product.title}
                className="h-16 w-16 rounded object-cover"
              />
            )}
            <div className="space-y-1">
              <div className="font-medium">{product.title}</div>
              <div className="text-xs text-slate-500">{product.handle}</div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Contracts</h3>
          {contractsLoading && <span className="text-xs text-slate-500">Loading...</span>}
        </div>

        <form className="space-y-2" onSubmit={handleUploadContract}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Vertrag (PDF)
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setContractFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-slate-500">
                Nur PDF, max. 20 MB.{" "}
                {contractFile ? (
                  <span className="text-slate-700">
                    Ausgewählt: {contractFile.name} ({Math.round(contractFile.size / 1024)} KB)
                  </span>
                ) : (
                  "Keine Datei gewählt."
                )}
              </p>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Vertragstyp
              <select
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="artist_contract">Artist Contract</option>
                <option value="consignment">Consignment</option>
                <option value="nda">NDA</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Signed at (optional)
            <input
              type="date"
              value={contractSignedAt}
              onChange={(e) => setContractSignedAt(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>

        {uploadContractError && <p className="text-sm text-red-600">{uploadContractError}</p>}
        {uploadContractMessage && <p className="text-sm text-green-600">{uploadContractMessage}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploadingContract || !contractFile}
              className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {uploadingContract ? "Uploading..." : "Upload contract"}
            </button>
          </div>
        </form>

        {contractsError && <p className="text-sm text-red-600">Fehler: {contractsError}</p>}
        {!contractsLoading && !contractsError && contracts.length === 0 && (
          <p className="text-sm text-slate-600">Keine Verträge vorhanden.</p>
        )}
        {contracts.length > 0 && (
          <ul className="grid gap-3">
            {contracts.map((contract) => (
              <li key={contract._id || contract.s3Key} className="rounded border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{contract.filename || "Contract"}</div>
                    <div className="text-xs text-slate-500">Typ: {contract.contractType}</div>
                    {contract.createdAt && (
                      <div className="text-xs text-slate-500">
                        Erstellt: {new Date(contract.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  {contract.s3Url ? (
                    <a
                      href={contract.s3Url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500 break-all">{contract.s3Key}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Payout</h3>
          {payoutLoading && <span className="text-xs text-slate-500">Loading...</span>}
        </div>
        {payoutError && <p className="text-sm text-red-600">Fehler: {payoutError}</p>}
        <form className="space-y-3" onSubmit={handleSavePayout}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Account holder
              <input
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Name"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              IBAN
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="IBAN"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              BIC
              <input
                value={bic}
                onChange={(e) => setBic(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="BIC"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Bank name
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Bank"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Address
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Address"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Tax ID
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Tax ID"
            />
          </label>

          {payoutSaveMessage && <p className="text-sm text-green-600">{payoutSaveMessage}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={payoutSaving}
              className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {payoutSaving ? "Saving..." : "Save payout"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
