"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Props = {
  artistId: string;
};

type Artist = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  stage?: string;
  internalNotes?: string;
  publicProfile?: {
    name?: string;
    displayName?: string;
    quote?: string;
    einleitung_1?: string;
    text_1?: string;
    kategorie?: string;
    bilder?: string;
    bild_1?: string;
    bild_2?: string;
    bild_3?: string;
    bio?: string;
    location?: string;
    website?: string;
    instagram?: string;
    heroImageUrl?: string;
  };
  shopifySync?: {
    metaobjectId?: string;
    handle?: string;
    lastSyncedAt?: string;
    lastSyncStatus?: string;
    lastSyncError?: string;
  };
  createdAt?: string;
  updatedAt?: string;
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

type MediaItem = {
  _id: string;
  artistId: string;
  kind: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  s3Key: string;
  url?: string;
  createdAt?: string;
};

type Artwork = {
  _id: string;
  title: string;
  saleType: string;
  price?: number;
  currency?: string;
  editionSize?: number;
  status?: string;
  shopify?: {
    productId?: string;
    handle?: string;
    lastPushedAt?: string;
    lastPushError?: string;
  };
  images?: { mediaId: string; url?: string; filename?: string }[];
};

type ShopifyCollection = { id: string; title: string };

const stageOptions = ["Idea", "In Review", "Offer", "Under Contract"] as const;

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
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<string>("Idea");
  const [advancedSectionsEnabled, setAdvancedSectionsEnabled] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [publicName, setPublicName] = useState("");
  const [publicInstagram, setPublicInstagram] = useState("");
  const [publicQuote, setPublicQuote] = useState("");
  const [publicEinleitung1, setPublicEinleitung1] = useState("");
  const [publicText1, setPublicText1] = useState("");
  const [publicKategorie, setPublicKategorie] = useState("");
  const [publicBilder, setPublicBilder] = useState("");
  const [publicBild1, setPublicBild1] = useState("");
  const [publicBild2, setPublicBild2] = useState("");
  const [publicBild3, setPublicBild3] = useState("");
  const [publicLocation, setPublicLocation] = useState("");
  const [publicWebsite, setPublicWebsite] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionResults, setCollectionResults] = useState<ShopifyCollection[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [selectedCollectionTitle, setSelectedCollectionTitle] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
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
  const [shopifySyncing, setShopifySyncing] = useState(false);
  const [shopifyMessage, setShopifyMessage] = useState<string | null>(null);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState("artwork");
  const [mediaFiles, setMediaFiles] = useState<FileList | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [artworksLoading, setArtworksLoading] = useState(false);
  const [artworksError, setArtworksError] = useState<string | null>(null);
  const [artworkTitle, setArtworkTitle] = useState("");
  const [artworkSaleType, setArtworkSaleType] = useState("print");
  const [artworkPrice, setArtworkPrice] = useState("");
  const [artworkEditionSize, setArtworkEditionSize] = useState("");
  const [artworkDescription, setArtworkDescription] = useState("");
  const [artworkSaving, setArtworkSaving] = useState(false);
  const [artworkMessage, setArtworkMessage] = useState<string | null>(null);

  const buildPublicProfilePayload = (
    overrides: Partial<NonNullable<Artist["publicProfile"]>> = {},
  ): Partial<Artist["publicProfile"]> => ({
    name: publicName.trim() || undefined,
    displayName: publicName.trim() || undefined,
    instagram: publicInstagram.trim() || undefined,
    quote: publicQuote.trim() || undefined,
    einleitung_1: publicEinleitung1.trim() || undefined,
    text_1: publicText1.trim() || undefined,
    bio: publicText1.trim() || undefined,
    kategorie: publicKategorie.trim() || undefined,
    bilder: publicBilder.trim() || undefined,
    bild_1: publicBild1.trim() || undefined,
    bild_2: publicBild2.trim() || undefined,
    bild_3: publicBild3.trim() || undefined,
    location: publicLocation.trim() || undefined,
    website: publicWebsite.trim() || undefined,
    heroImageUrl: artist?.publicProfile?.heroImageUrl,
    ...overrides,
  });

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
        const data = json.artist as Artist;
        setArtist(data);
        setName(data.name ?? "");
        setEmail(data.email ?? "");
        setPhone(data.phone ?? "");
        setStage(data.stage ?? "Idea");
        setInternalNotes(data.internalNotes ?? "");
        setPublicName(data.publicProfile?.name ?? data.publicProfile?.displayName ?? "");
        setPublicInstagram(data.publicProfile?.instagram ?? "");
        setPublicQuote(data.publicProfile?.quote ?? "");
        setPublicEinleitung1(data.publicProfile?.einleitung_1 ?? "");
        setPublicText1(data.publicProfile?.text_1 ?? data.publicProfile?.bio ?? "");
        setPublicKategorie(data.publicProfile?.kategorie ?? "");
        setPublicBilder(data.publicProfile?.bilder ?? "");
        setPublicBild1(data.publicProfile?.bild_1 ?? "");
        setPublicBild2(data.publicProfile?.bild_2 ?? "");
        setPublicBild3(data.publicProfile?.bild_3 ?? "");
        setPublicLocation(data.publicProfile?.location ?? "");
        setPublicWebsite(data.publicProfile?.website ?? "");
        setSelectedCollectionTitle(null);
        setCollectionSearch("");
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

    const loadMedia = async () => {
      setMediaLoading(true);
      setMediaError(null);
      try {
        const res = await fetch(`/api/media?kunstlerId=${encodeURIComponent(artistId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        setMedia(Array.isArray(json.media) ? json.media : []);
      } catch (err: any) {
        if (!active) return;
        setMediaError(err?.message ?? "Failed to load media");
      } finally {
        if (active) setMediaLoading(false);
      }
    };

    const loadArtworks = async () => {
      setArtworksLoading(true);
      setArtworksError(null);
      try {
        const res = await fetch(`/api/artworks?artistId=${encodeURIComponent(artistId)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        setArtworks(Array.isArray(json.artworks) ? json.artworks : []);
      } catch (err: any) {
        if (!active) return;
        setArtworksError(err?.message ?? "Failed to load artworks");
      } finally {
        if (active) setArtworksLoading(false);
      }
    };

    loadContracts();
    loadPayout();
    loadMedia();
    loadArtworks();
    return () => {
      active = false;
    };
  }, [artistId]);

  useEffect(() => {
    if (stage !== "Under Contract") {
      setAdvancedSectionsEnabled(false);
    }
  }, [stage]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setCollectionLoading(true);
      setCollectionError(null);
      try {
        const search = collectionSearch.trim();
        const res = await fetch(`/api/shopify/collections${search ? `?q=${encodeURIComponent(search)}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(parseErrorMessage(payload));
        }
        const json = await res.json();
        if (!active) return;
        const list: ShopifyCollection[] = Array.isArray(json.collections) ? json.collections : [];
        const merged = [...list];
        if (publicKategorie) {
          const exists = merged.some((c) => c.id === publicKategorie);
          if (!exists) {
            merged.unshift({
              id: publicKategorie,
              title: selectedCollectionTitle || publicKategorie,
            });
          }
        }
        setCollectionResults(merged);
      } catch (err: any) {
        if (!active || err?.name === "AbortError") return;
        setCollectionError(err?.message ?? "Failed to load collections");
      } finally {
        if (active) setCollectionLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [collectionSearch, publicKategorie, selectedCollectionTitle]);

  const handleSelectCollection = (id: string) => {
    if (!id) {
      setPublicKategorie("");
      setSelectedCollectionTitle(null);
      return;
    }
    const selected = collectionResults.find((c) => c.id === id);
    setPublicKategorie(id);
    setSelectedCollectionTitle(selected?.title ?? null);
  };

  const persistArtist = async () => {
    const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        stage,
        internalNotes: internalNotes.trim(),
        publicProfile: buildPublicProfilePayload(),
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(parseErrorMessage(payload));
    }
    const json = await res.json();
    const updated = json.artist as Artist;
    setArtist(updated);
    return updated;
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      await persistArtist();
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

  const selectedCollectionLabel = publicKategorie
    ? selectedCollectionTitle || publicKategorie
    : "Keine Kategorie ausgewählt";

  const isUnderContract = stage === "Under Contract";
  const showAdvancedSections = isUnderContract || advancedSectionsEnabled;
  const canSync = isUnderContract && publicName.trim().length > 0 && publicText1.trim().length > 0;

  const handleSyncShopify = async () => {
    setShopifyError(null);
    setShopifyMessage(null);
    if (!canSync) {
      setShopifyError("Name und text_1 sind erforderlich für den Sync.");
      return;
    }
    setShopifySyncing(true);
    try {
      // Persist latest form state before syncing so Shopify receives up-to-date data.
      await persistArtist();

      const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}/shopify-sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || "Sync fehlgeschlagen");
      }
      const json = await res.json();
      setArtist((prev) => (prev ? { ...prev, shopifySync: json.shopifySync } : prev));
      setShopifyMessage("Shopify Sync erfolgreich");
    } catch (err: any) {
      setShopifyError(err?.message ?? "Sync fehlgeschlagen");
    } finally {
      setShopifySyncing(false);
    }
  };

  const handleUploadMedia = async (e: FormEvent) => {
    e.preventDefault();
    setMediaError(null);
    if (!mediaFiles || mediaFiles.length === 0) {
      setMediaError("Bitte mindestens eine Datei auswählen.");
      return;
    }
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("kunstlerId", artistId);
      formData.append("kind", mediaKind);
      Array.from(mediaFiles).forEach((file) => formData.append("files", file));

      const res = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      const json = await res.json();
      setMedia((prev) => [...json.media, ...prev]);
      setMediaFiles(null);
    } catch (err: any) {
      setMediaError(err?.message ?? "Upload failed");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleDeleteMedia = async (id: string) => {
    setMediaError(null);
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      setMedia((prev) => prev.filter((m) => m._id !== id));
    } catch (err: any) {
      setMediaError(err?.message ?? "Delete failed");
    }
  };

  const handleSetHeroImage = async (item: MediaItem) => {
    if (!item.url) {
      setMediaError("Kein öffentliches URL verfügbar");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/artists/${encodeURIComponent(artistId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicProfile: buildPublicProfilePayload({ heroImageUrl: item.url }),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      const json = await res.json();
      setArtist(json.artist);
      setSaveMessage("Hero image gesetzt");
    } catch (err: any) {
      setError(err?.message ?? "Failed to set hero image");
    } finally {
      setSaving(false);
    }
  };

  const toggleMediaSelection = (id: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleCreateArtwork = async (e: FormEvent) => {
    e.preventDefault();
    setArtworksError(null);
    setArtworkMessage(null);
    if (!artworkTitle.trim()) {
      setArtworksError("Title required");
      return;
    }
    if (selectedMediaIds.length === 0) {
      setArtworksError("Bitte mindestens ein Bild auswählen.");
      return;
    }
    if ((artworkSaleType === "print" || artworkSaleType === "both") && !artworkEditionSize.trim()) {
      setArtworksError("Edition size erforderlich für Print/Both.");
      return;
    }
    setArtworkSaving(true);
    try {
      const res = await fetch("/api/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          title: artworkTitle.trim(),
          description: artworkDescription.trim() || undefined,
          saleType: artworkSaleType,
          price: artworkPrice ? Number(artworkPrice) : undefined,
          currency: "EUR",
          editionSize: artworkEditionSize ? Number(artworkEditionSize) : undefined,
          mediaIds: selectedMediaIds,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      const json = await res.json();
      setArtworks((prev) => [json.artwork, ...prev]);
      setArtworkMessage("Artwork gespeichert");
      setArtworkTitle("");
      setArtworkDescription("");
      setArtworkPrice("");
      setArtworkEditionSize("");
      setSelectedMediaIds([]);
    } catch (err: any) {
      setArtworksError(err?.message ?? "Failed to create artwork");
    } finally {
      setArtworkSaving(false);
    }
  };

  const handlePushArtwork = async (id: string) => {
    setArtworksError(null);
    try {
      const res = await fetch(`/api/artworks/${encodeURIComponent(id)}/shopify-push`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      const json = await res.json();
      setArtworks((prev) =>
        prev.map((a) =>
          a._id === id
            ? {
                ...a,
                status: "pushed",
                shopify: { ...a.shopify, productId: json.product.id, handle: json.product.handle, lastPushedAt: new Date().toISOString(), lastPushError: undefined },
              }
            : a,
        ),
      );
    } catch (err: any) {
      setArtworksError(err?.message ?? "Push failed");
    }
  };

  const mediaHeader = (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-slate-800">Media</h3>
      {mediaLoading && <span className="text-xs text-slate-500">Loading...</span>}
    </div>
  );

  const mediaContent = (
    <>
      <form className="space-y-2" onSubmit={handleUploadMedia}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Dateien
            <input
              type="file"
              multiple
              onChange={(e) => setMediaFiles(e.target.files)}
              className="w-full text-sm"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Kind
            <select
              value={mediaKind}
              onChange={(e) => setMediaKind(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="artwork">Artwork</option>
              <option value="social">Social</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        {mediaError && <p className="text-sm text-red-600">{mediaError}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploadingMedia}
            className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {uploadingMedia ? "Uploading..." : "Upload media"}
          </button>
        </div>
      </form>

      {!mediaLoading && !mediaError && media.length === 0 && (
        <p className="text-sm text-slate-600">Keine Medien vorhanden.</p>
      )}
      {media.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {media.map((item) => {
            const isImage = item.mimeType?.startsWith("image/");
            return (
              <li key={item._id} className="flex gap-3 rounded border border-slate-200 p-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedMediaIds.includes(item._id)}
                  onChange={() => toggleMediaSelection(item._id)}
                  aria-label="Select media"
                />
                {isImage && item.url ? (
                  <img src={item.url} alt={item.filename || item.s3Key} className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-500">
                    {item.mimeType || "file"}
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <div className="font-medium text-sm">{item.filename || item.s3Key}</div>
                  <div className="text-xs text-slate-500">
                    {item.kind} {item.createdAt ? `• ${new Date(item.createdAt).toLocaleDateString()}` : ""}
                  </div>
                  {item.url && (
                    <button
                      type="button"
                      onClick={() => handleSetHeroImage(item)}
                      className="text-xs text-blue-600 underline"
                    >
                      Set as Hero Image
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteMedia(item._id)}
                  className="text-xs text-red-600 underline"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const artworksHeader = (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-slate-800">Artworks</h3>
      {artworksLoading && <span className="text-xs text-slate-500">Loading...</span>}
    </div>
  );

  const artworksContent = (
    <>
      <form className="space-y-3 rounded border border-slate-200 p-3" onSubmit={handleCreateArtwork}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Title
            <input
              value={artworkTitle}
              onChange={(e) => setArtworkTitle(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Sale type
            <select
              value={artworkSaleType}
              onChange={(e) => setArtworkSaleType(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="print">Print</option>
              <option value="original">Original</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Price (optional)
            <input
              value={artworkPrice}
              onChange={(e) => setArtworkPrice(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </label>
          {(artworkSaleType === "print" || artworkSaleType === "both") && (
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Edition size
              <input
                value={artworkEditionSize}
                onChange={(e) => setArtworkEditionSize(e.target.value)}
                type="number"
                min="1"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </label>
          )}
        </div>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Description (optional)
          <textarea
            value={artworkDescription}
            onChange={(e) => setArtworkDescription(e.target.value)}
            rows={3}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>
        {artworksError && <p className="text-sm text-red-600">{artworksError}</p>}
        {artworkMessage && <p className="text-sm text-green-600">{artworkMessage}</p>}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{selectedMediaIds.length} Medien ausgewählt</span>
          <button
            type="submit"
            disabled={artworkSaving}
            className="inline-flex items-center rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {artworkSaving ? "Saving..." : "Create Artwork"}
          </button>
        </div>
      </form>

      {!artworksLoading && artworks.length === 0 && (
        <p className="text-sm text-slate-600">No artworks yet.</p>
      )}
      {artworks.length > 0 && (
        <ul className="grid gap-3">
          {artworks.map((artwork) => (
            <li key={artwork._id} className="rounded border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="font-medium">{artwork.title}</div>
                <span className="text-xs text-slate-500">
                  {artwork.saleType} {artwork.status ? `• ${artwork.status}` : ""}
                </span>
              </div>
              {artwork.editionSize && (
                <div className="text-xs text-slate-500">Edition: {artwork.editionSize}</div>
              )}
              {artwork.shopify?.productId ? (
                <div className="text-xs text-green-600">Shopify draft: {artwork.shopify.handle || artwork.shopify.productId}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePushArtwork(artwork._id)}
                  className="text-xs text-blue-600 underline"
                >
                  Create Shopify Draft Product
                </button>
              )}
              {artwork.shopify?.lastPushError && (
                <div className="text-xs text-red-600">Last push error: {artwork.shopify.lastPushError}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );

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

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">ID</div>
          <div className="font-mono text-sm text-slate-700 break-all">{artist._id}</div>
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
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="email@example.com"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="+49 ..."
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            Stage
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {!isUnderContract && (
              <div className="space-y-1 text-xs font-normal text-slate-600">
                <p>Only internal fields are shown. Switch to 'Under Contract' to unlock contracts, payout and Shopify sync.</p>
                <label className="inline-flex items-center gap-2 text-xs font-normal text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-black focus:ring-black"
                    checked={advancedSectionsEnabled}
                    onChange={(e) => setAdvancedSectionsEnabled(e.target.checked)}
                  />
                  Advanced sections
                </label>
              </div>
            )}
          </label>
        </div>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          Internal notes
          <textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={4}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Notes"
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

      {isUnderContract ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          {mediaHeader}
          <div className="space-y-4">{mediaContent}</div>
        </div>
      ) : (
        <details className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
            {mediaHeader}
          </summary>
          <div className="space-y-4 border-t border-slate-200 p-4">{mediaContent}</div>
        </details>
      )}

      {isUnderContract ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          {artworksHeader}
          <div className="space-y-4">{artworksContent}</div>
        </div>
      ) : (
        <details className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
            {artworksHeader}
          </summary>
          <div className="space-y-4 border-t border-slate-200 p-4">{artworksContent}</div>
        </details>
      )}

      {showAdvancedSections && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Public Profile (required for Under Contract)</h3>
              {artist.shopifySync?.lastSyncStatus && (
                <span className="text-xs text-slate-500">
                  Status: {artist.shopifySync.lastSyncStatus}
                  {artist.shopifySync.lastSyncedAt && ` • ${new Date(artist.shopifySync.lastSyncedAt).toLocaleString()}`}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Name {stage === "Under Contract" && <span className="text-red-600">*</span>}
                <input
                  value={publicName}
                  onChange={(e) => setPublicName(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Public name"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Instagram (URL)
                <input
                  type="url"
                  value={publicInstagram}
                  onChange={(e) => setPublicInstagram(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="https://instagram.com/..."
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Quote
                <input
                  value={publicQuote}
                  onChange={(e) => setPublicQuote(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Kurz-Zitat"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Kategorie (Shopify Collection, optional)
                <div className="space-y-2 rounded border border-slate-200 p-3">
                  <input
                    type="search"
                    value={collectionSearch}
                    onChange={(e) => setCollectionSearch(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    placeholder="Kollektionen suchen..."
                  />
                  <select
                    value={publicKategorie}
                    onChange={(e) => handleSelectCollection(e.target.value)}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="">Keine Kategorie</option>
                    {collectionResults.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.title}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="break-all">Auswahl: {selectedCollectionLabel}</span>
                    {publicKategorie && (
                      <button
                        type="button"
                        onClick={() => handleSelectCollection("")}
                        className="text-blue-600 underline"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                  {collectionLoading && <p className="text-xs text-slate-500">Lade Collections...</p>}
                  {collectionError && <p className="text-xs text-red-600">{collectionError}</p>}
                  {!collectionLoading && !collectionResults.length && !collectionError && (
                    <p className="text-xs text-slate-500">Keine Collections gefunden.</p>
                  )}
                </div>
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Einleitung 1
              <textarea
                value={publicEinleitung1}
                onChange={(e) => setPublicEinleitung1(e.target.value)}
                rows={3}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Intro text"
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Text 1 {stage === "Under Contract" && <span className="text-red-600">*</span>}
              <textarea
                value={publicText1}
                onChange={(e) => setPublicText1(e.target.value)}
                rows={5}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Main text"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Titelbild (Shopify File ID / GID)
                <input
                  value={publicBilder}
                  onChange={(e) => setPublicBilder(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="gid://shopify/File/..."
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Bild 1 (Shopify File ID / GID)
                <input
                  value={publicBild1}
                  onChange={(e) => setPublicBild1(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="gid://shopify/File/..."
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Bild 2 (Shopify File ID / GID)
                <input
                  value={publicBild2}
                  onChange={(e) => setPublicBild2(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="gid://shopify/File/..."
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Bild 3 (Shopify File ID / GID)
                <input
                  value={publicBild3}
                  onChange={(e) => setPublicBild3(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="gid://shopify/File/..."
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Location (internal only, not sent to Shopify)
                <input
                  value={publicLocation}
                  onChange={(e) => setPublicLocation(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="City, Country"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Website (internal only)
                <input
                  value={publicWebsite}
                  onChange={(e) => setPublicWebsite(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="https://"
                />
              </label>
            </div>

            {shopifyError && <p className="text-sm text-red-600">{shopifyError}</p>}
            {shopifyMessage && <p className="text-sm text-green-600">{shopifyMessage}</p>}
            {artist.shopifySync?.lastSyncError && (
              <p className="text-sm text-red-600">Last error: {artist.shopifySync.lastSyncError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSyncShopify}
                disabled={shopifySyncing || !canSync}
                className="inline-flex items-center rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {shopifySyncing ? "Syncing..." : "Sync to Shopify"}
              </button>
            </div>
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
        </>
      )}
    </section>
  );
}
