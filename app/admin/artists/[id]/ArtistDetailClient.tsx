"use client";

import type { ReactElement } from "react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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

type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status?: string | null;
  firstVariantPrice: string | null;
  imageUrl: string | null;
  breiteCm: number | null;
  heightCm: number | null;
  kurzbeschreibung: string | null;
  shopifyAdminUrl: string | null;
};

type ShopifyCollection = { id: string; title: string };
type ArtworkSaleMode = "PRINT_ONLY" | "ORIGINAL_ONLY" | "ORIGINAL_AND_PRINTS";
type ArtworkFieldErrors = Record<string, string>;
type BulkTitleStrategy = "filename" | "prefix";
type BulkDefaults = {
  mode: ArtworkSaleMode;
  titlePrefix: string;
  titleStrategy: BulkTitleStrategy;
  widthCm: string;
  heightCm: string;
  shortDescription: string;
};
type BulkUiMode = "defaults" | "table";
type BulkRow = {
  mediaId: string;
  filename: string;
  url?: string;
  mimeType?: string;
  title: string;
  mode: ArtworkSaleMode;
  widthCm: string;
  heightCm: string;
  shortDescription: string;
  useDefaults: boolean;
};
type BulkCreateResult = {
  ok: boolean;
  mediaId: string;
  mediaFilename: string;
  title: string;
  productGid?: string | null;
  productId?: string | null;
  handle?: string | null;
  adminUrl?: string | null;
  error?: string | null;
};

type ShopifyFileFieldKey = "bilder" | "bild_1" | "bild_2" | "bild_3";
type FileUploadStatus = {
  uploading: boolean;
  filename: string | null;
  error: string | null;
  success: string | null;
};

const stageOptions = ["Idea", "In Review", "Offer", "Under Contract"] as const;
type Stage = (typeof stageOptions)[number];
type TabKey = "overview" | "media" | "artworks" | "publicProfile" | "contracts" | "payout";

function parseErrorMessage(payload: any) {
  if (!payload) return "Unexpected error";
  if (typeof payload === "string") return payload;
  if (payload.error) {
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
  }
  return "Unexpected error";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const parseProductIdFromGid = (gid?: string | null) => {
  if (!gid) return null;
  const parts = gid.split("/");
  return parts[parts.length - 1] || gid;
};

async function fetchShopifyProductsForMetaobject(metaobjectId: string) {
  const res = await fetch(`/api/shopify/products-by-artist?artistMetaobjectGid=${encodeURIComponent(metaobjectId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(parseErrorMessage(payload));
  }
  const json = await res.json();
  return Array.isArray(json.products) ? json.products : [];
}

export default function ArtistDetailClient({ artistId }: Props) {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>("Idea");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
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
  const [fileUploads, setFileUploads] = useState<Record<ShopifyFileFieldKey, FileUploadStatus>>({
    bilder: { uploading: false, filename: null, error: null, success: null },
    bild_1: { uploading: false, filename: null, error: null, success: null },
    bild_2: { uploading: false, filename: null, error: null, success: null },
    bild_3: { uploading: false, filename: null, error: null, success: null },
  });
  const fileInputRefs = {
    bilder: useRef<HTMLInputElement | null>(null),
    bild_1: useRef<HTMLInputElement | null>(null),
    bild_2: useRef<HTMLInputElement | null>(null),
    bild_3: useRef<HTMLInputElement | null>(null),
  };
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
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [shopifyProductsLoading, setShopifyProductsLoading] = useState(false);
  const [shopifyProductsError, setShopifyProductsError] = useState<string | null>(null);
  const [selectedArtworkMediaIds, setSelectedArtworkMediaIds] = useState<string[]>([]);
  const [artworkTitle, setArtworkTitle] = useState("");
  const [artworkSaleMode, setArtworkSaleMode] = useState<ArtworkSaleMode>("PRINT_ONLY");
  const [artworkPrice, setArtworkPrice] = useState("");
  const [artworkEditionSize, setArtworkEditionSize] = useState("");
  const [artworkKurzbeschreibung, setArtworkKurzbeschreibung] = useState("");
  const [artworkWidthCm, setArtworkWidthCm] = useState("");
  const [artworkHeightCm, setArtworkHeightCm] = useState("");
  const [artworkDescription, setArtworkDescription] = useState("");
  const [artworkSubmitting, setArtworkSubmitting] = useState(false);
  const [artworkFormError, setArtworkFormError] = useState<string | null>(null);
  const [artworkFieldErrors, setArtworkFieldErrors] = useState<ArtworkFieldErrors>({});
  const [artworkSuccess, setArtworkSuccess] = useState<string | null>(null);
  const [artworkSuccessAdminUrl, setArtworkSuccessAdminUrl] = useState<string | null>(null);
  const [artworkGalleryUploading, setArtworkGalleryUploading] = useState(false);
  const artworkUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [previewMedia, setPreviewMedia] = useState<MediaItem | null>(null);
  const [draggingArtworkUpload, setDraggingArtworkUpload] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState<BulkCreateResult[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkUiMode, setBulkUiMode] = useState<BulkUiMode>("defaults");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkDefaults, setBulkDefaults] = useState<BulkDefaults>({
    mode: "PRINT_ONLY",
    titlePrefix: "",
    titleStrategy: "filename",
    widthCm: "",
    heightCm: "",
    shortDescription: "",
  });
  const bulkCancelRef = useRef(false);
  const bulkAbortController = useRef<AbortController | null>(null);
  const artistRecordId = artist?._id;
  const artistShopifyMetaobjectId = artist?.shopifySync?.metaobjectId;

  const refreshShopifyProducts = async (): Promise<ShopifyProduct[]> => {
    const metaobjectId = artistRecordId === artistId ? artistShopifyMetaobjectId : undefined;
    if (!metaobjectId) {
      setShopifyProducts([]);
      setShopifyProductsError(null);
      return [];
    }

    setShopifyProductsLoading(true);
    setShopifyProductsError(null);
    try {
      const products = await fetchShopifyProductsForMetaobject(metaobjectId);
      setShopifyProducts(products);
      return products;
    } catch (err: any) {
      setShopifyProductsError(err?.message ?? "Failed to load artworks from Shopify");
      return [];
    } finally {
      setShopifyProductsLoading(false);
    }
  };

  const fetchMediaList = useCallback(async (): Promise<MediaItem[]> => {
    const res = await fetch(`/api/media?kunstlerId=${encodeURIComponent(artistId)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(parseErrorMessage(payload));
    }
    const json = await res.json();
    return Array.isArray(json.media) ? json.media : [];
  }, [artistId]);

  const refreshMediaList = useCallback(async () => {
    setMediaLoading(true);
    setMediaError(null);
    try {
      const list = await fetchMediaList();
      setMedia(list);
      return list;
    } catch (err: any) {
      setMediaError(err?.message ?? "Failed to load media");
      return [];
    } finally {
      setMediaLoading(false);
    }
  }, [fetchMediaList]);

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

  const updateFileUploadState = (key: ShopifyFileFieldKey, patch: Partial<FileUploadStatus>) => {
    setFileUploads((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const setPublicImageGid = (key: ShopifyFileFieldKey, gid: string) => {
    switch (key) {
      case "bilder":
        setPublicBilder(gid);
        break;
      case "bild_1":
        setPublicBild1(gid);
        break;
      case "bild_2":
        setPublicBild2(gid);
        break;
      case "bild_3":
        setPublicBild3(gid);
        break;
      default:
        break;
    }
  };

  const triggerFilePicker = (key: ShopifyFileFieldKey) => {
    const ref = fileInputRefs[key];
    ref?.current?.click();
  };

  const handleShopifyFileUpload = async (key: ShopifyFileFieldKey, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    updateFileUploadState(key, { uploading: true, filename: file.name, error: null, success: null });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/shopify/files/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseErrorMessage(payload));
      }
      const gid = payload?.fileIdGid as string | undefined;
      if (gid) {
        setPublicImageGid(key, gid);
      }
      updateFileUploadState(key, {
        uploading: false,
        success: payload?.filename ? `Hochgeladen: ${payload.filename}` : "Upload erfolgreich",
        error: null,
      });
    } catch (err: any) {
      updateFileUploadState(key, {
        uploading: false,
        error: err?.message || "Upload fehlgeschlagen",
        success: null,
      });
    } finally {
      const ref = fileInputRefs[key];
      if (ref?.current) {
        ref.current.value = "";
      }
    }
  };

  const renderShopifyFileField = (
    key: ShopifyFileFieldKey,
    label: string,
    value: string,
    onChange: (next: string) => void,
  ) => {
    const upload = fileUploads[key];
    return (
      <label className="space-y-1 text-sm font-medium text-slate-700">
        {label}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          placeholder="gid://shopify/File/..."
        />
        <div className="flex flex-wrap items-center gap-2 text-xs font-normal text-slate-700">
          <input
            ref={fileInputRefs[key]}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleShopifyFileUpload(key, e.target.files)}
          />
          <button
            type="button"
            onClick={() => triggerFilePicker(key)}
            disabled={upload?.uploading}
            className="inline-flex items-center rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {upload?.uploading ? "Uploading..." : "Upload to Shopify"}
          </button>
          {upload?.filename && upload.uploading && <span className="text-slate-600">Lade {upload.filename}...</span>}
          {upload?.filename && !upload.uploading && !upload.error && (
            <span className="text-slate-600">Datei: {upload.filename}</span>
          )}
          {upload?.success && <span className="text-green-600">{upload.success}</span>}
          {upload?.error && <span className="text-red-600">{upload.error}</span>}
        </div>
      </label>
    );
  };

  useEffect(() => {
    let active = true;
    setArtworkSuccess(null);
    setArtworkSuccessAdminUrl(null);
    setSelectedArtworkMediaIds([]);
    setArtworkTitle("");
    setArtworkSaleMode("PRINT_ONLY");
    setArtworkPrice("");
    setArtworkEditionSize("");
    setArtworkKurzbeschreibung("");
    setArtworkWidthCm("");
    setArtworkHeightCm("");
    setArtworkDescription("");
    setArtworkFieldErrors({});
    setArtworkFormError(null);
    setPreviewMedia(null);
    setDraggingArtworkUpload(false);
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
        const nextStage = stageOptions.includes(data.stage as Stage) ? (data.stage as Stage) : "Idea";
        setStage(nextStage);
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
    const metaobjectId = artistRecordId === artistId ? artistShopifyMetaobjectId : undefined;
    if (!artistRecordId || artistRecordId !== artistId || !metaobjectId) {
      setShopifyProducts([]);
      setShopifyProductsError(null);
      setShopifyProductsLoading(false);
      return () => {
        active = false;
      };
    }

    const loadProducts = async () => {
      setShopifyProductsLoading(true);
      setShopifyProductsError(null);
      try {
        const products = await fetchShopifyProductsForMetaobject(metaobjectId);
        if (!active) return;
        setShopifyProducts(products);
      } catch (err: any) {
        if (!active) return;
        setShopifyProductsError(err?.message ?? "Failed to load artworks from Shopify");
      } finally {
        if (active) setShopifyProductsLoading(false);
      }
    };

    loadProducts();
    return () => {
      active = false;
    };
  }, [artistId, artistRecordId, artistShopifyMetaobjectId]);

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
        const list = await fetchMediaList();
        if (!active) return;
        setMedia(list);
      } catch (err: any) {
        if (!active) return;
        setMediaError(err?.message ?? "Failed to load media");
      } finally {
        if (active) setMediaLoading(false);
      }
    };

    loadContracts();
    loadPayout();
    loadMedia();
    return () => {
      active = false;
    };
  }, [artistId, fetchMediaList]);

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

  const formatStage = (value: Stage) => (value === "Offer" ? "Offer (Angebot)" : value);
  const stageOrder = stageOptions;
  const stageIndex = Math.max(0, stageOrder.indexOf(stage));
  const isUnderContract = stage === "Under Contract";
  const canViewMedia = stageIndex >= stageOrder.indexOf("In Review");
  const canViewArtworks = stageIndex >= stageOrder.indexOf("In Review");
  const canViewContracts = stageIndex >= stageOrder.indexOf("Offer");
  const canViewPublicProfile = stageIndex >= stageOrder.indexOf("Under Contract");
  const canViewPayout = canViewPublicProfile;
  const tabAvailability: Record<TabKey, { enabled: boolean; reason?: string }> = {
    overview: { enabled: true },
    media: { enabled: canViewMedia, reason: "Available from In Review" },
    artworks: { enabled: canViewArtworks, reason: "Available from In Review" },
    contracts: { enabled: canViewContracts, reason: "Available from Offer/Angebot" },
    publicProfile: { enabled: canViewPublicProfile, reason: "Available from Under Contract" },
    payout: { enabled: canViewPayout, reason: "Available from Under Contract" },
  };
  const hasMedia = media.length > 0;
  const artworkMedia = media.filter((item) => item.kind?.toLowerCase() === "artwork");
  const selectedArtworkMedia = artworkMedia.filter((item) => selectedArtworkMediaIds.includes(item._id));
  const hasArtworkMedia = artworkMedia.length > 0;
  const hasShopifyLink = Boolean(artist?.shopifySync?.metaobjectId);
  const hasShopifyArtworks = shopifyProducts.length > 0;
  const hasPublicImage = [publicBilder, publicBild1, publicBild2, publicBild3].some((value) => value && value.trim().length > 0);
  const hasPublicProfileRequired = publicName.trim().length > 0 && publicText1.trim().length > 0 && hasPublicImage;
  const hasContract = contracts.length > 0;
  const hasPayoutRequired = Boolean(accountHolder.trim() && iban.trim() && bic.trim());
  const canSync = isUnderContract && publicName.trim().length > 0 && publicText1.trim().length > 0;
  const lastShopifyStatus = artist?.shopifySync?.lastSyncStatus;
  const lastShopifySyncedAt = artist?.shopifySync?.lastSyncedAt;
  const lastShopifyError = artist?.shopifySync?.lastSyncError;
  const overviewStatusChip = name.trim() ? "Basics added" : "Missing name";
  const mediaStatusChip = mediaLoading ? "Loading..." : canViewMedia ? (hasMedia ? "OK" : "Missing") : "Locked";
  const artworksStatusChip = shopifyProductsLoading
    ? "Loading..."
    : canViewArtworks
      ? hasShopifyLink
        ? hasShopifyArtworks
          ? "OK"
          : "Missing"
        : "Needs Shopify link"
      : "Locked";
  const publicProfileStatusChip = isUnderContract ? (hasPublicProfileRequired ? "OK" : "Missing") : "Not required";
  const contractsStatusChip = contractsLoading
    ? "Loading..."
    : canViewContracts
      ? hasContract
        ? "OK"
        : "Missing"
      : "Locked";
  const payoutStatusChip = payoutLoading
    ? "Loading..."
    : isUnderContract
      ? hasPayoutRequired
        ? "OK"
        : "Missing"
      : "Not required";
  const badgeTone = (state: "ready" | "missing" | "locked" | "info") => {
    switch (state) {
      case "ready":
        return "border-green-100 bg-green-50 text-green-700";
      case "missing":
        return "border-amber-100 bg-amber-50 text-amber-700";
      case "locked":
        return "border-slate-100 bg-slate-50 text-slate-700";
      default:
        return "border-slate-100 bg-slate-50 text-slate-700";
    }
  };
  const statusBadges = [
    { label: "Media", text: mediaStatusChip, tone: badgeTone(canViewMedia ? (hasMedia ? "ready" : "missing") : "locked") },
    {
      label: "Artworks",
      text: artworksStatusChip,
      tone: badgeTone(
        canViewArtworks
          ? hasShopifyLink && hasShopifyArtworks
            ? "ready"
            : "missing"
          : "locked",
      ),
    },
    { label: "Contracts", text: contractsStatusChip, tone: badgeTone(canViewContracts ? (hasContract ? "ready" : "missing") : "locked") },
    {
      label: "Public profile",
      text: publicProfileStatusChip,
      tone: badgeTone(isUnderContract ? (hasPublicProfileRequired ? "ready" : "missing") : "locked"),
    },
    {
      label: "Payout",
      text: payoutStatusChip,
      tone: badgeTone(isUnderContract ? (hasPayoutRequired ? "ready" : "missing") : "locked"),
    },
  ];
  const saleModeOptions: Array<{ value: ArtworkSaleMode; label: string; helper: string }> = [
    {
      value: "PRINT_ONLY",
      label: "Print only",
      helper: "No original tag. Leave price empty to keep prints-only automation.",
    },
    {
      value: "ORIGINAL_AND_PRINTS",
      label: "Original (+ prints)",
      helper: "Requires price and applies the \"original\" tag.",
    },
  ];
  const goToTab = (tab: TabKey) => setActiveTab(tab);
  const checklistItems: Array<{
    key: TabKey;
    label: string;
    done: boolean;
    requiredStage: string;
  }> = [
    { key: "media", label: "Add media", done: hasMedia, requiredStage: "In Review" },
    { key: "artworks", label: "Review Shopify artworks", done: hasShopifyArtworks, requiredStage: "In Review" },
    { key: "contracts", label: "Upload contract", done: hasContract, requiredStage: "Offer/Angebot" },
    { key: "publicProfile", label: "Complete public profile", done: hasPublicProfileRequired, requiredStage: "Under Contract" },
    { key: "payout", label: "Add payout details", done: hasPayoutRequired, requiredStage: "Under Contract" },
  ];

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

  const contextualCta = (() => {
    if (stage === "Idea") {
      return { label: "Add media", action: () => goToTab("media"), primary: true };
    }
    if (stage === "In Review") {
      return { label: "Upload media", action: () => goToTab("media"), primary: true };
    }
    if (stage === "Offer") {
      return { label: "Upload contract", action: () => goToTab("contracts"), primary: true };
    }
    if (isUnderContract) {
      if (!hasPublicProfileRequired) {
        return { label: "Complete profile", action: () => goToTab("publicProfile"), primary: true };
      }
      if (!hasContract) {
        return { label: "Upload contract", action: () => goToTab("contracts"), primary: true };
      }
      if (!hasPayoutRequired) {
        return { label: "Add payout details", action: () => goToTab("payout"), primary: true };
      }
      return { label: "Sync to Shopify", action: handleSyncShopify, primary: true, disabled: shopifySyncing || !canSync };
    }
    return null;
  })();

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

  const handleUploadArtworkMedia = async (files: FileList | null) => {
    if (!files || files.length === 0 || artworkGalleryUploading) return;
    setMediaError(null);
    setArtworkSuccess(null);
    setArtworkSuccessAdminUrl(null);
    setArtworkGalleryUploading(true);
    try {
      const formData = new FormData();
      formData.append("kunstlerId", artistId);
      formData.append("kind", "artwork");
      Array.from(files).forEach((file) => formData.append("files", file));

      const res = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(parseErrorMessage(payload));
      }
      const json = await res.json();
      const uploaded: MediaItem[] = Array.isArray(json.media) ? json.media : [];
      const uploadedIds = uploaded.map((item) => item._id).filter(Boolean) as string[];
      if (uploaded.length) {
        setMedia((prev) => [...uploaded, ...prev]);
      }
      if (uploadedIds.length) {
        setSelectedArtworkMediaIds((prev) => {
          const next = new Set(prev);
          uploadedIds.forEach((id) => next.add(id));
          return Array.from(next);
        });
        setArtworkFieldErrors((prev) => {
          const next = { ...prev };
          delete next.mediaIds;
          return next;
        });
      }
      await refreshMediaList();
    } catch (err: any) {
      setMediaError(err?.message ?? "Upload failed");
    } finally {
      setArtworkGalleryUploading(false);
      if (artworkUploadInputRef.current) {
        artworkUploadInputRef.current.value = "";
      }
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
      setSelectedArtworkMediaIds((prev) => prev.filter((mId) => mId !== id));
      if (previewMedia?._id === id) {
        setPreviewMedia(null);
      }
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

  const resetArtworkForm = () => {
    setSelectedArtworkMediaIds([]);
    setArtworkTitle("");
    setArtworkSaleMode("PRINT_ONLY");
    setArtworkPrice("");
    setArtworkEditionSize("");
    setArtworkKurzbeschreibung("");
    setArtworkWidthCm("");
    setArtworkHeightCm("");
    setArtworkDescription("");
    setArtworkFieldErrors({});
    setArtworkFormError(null);
  };

  const toggleArtworkMediaSelection = (id: string) => {
    setSelectedArtworkMediaIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setArtworkFieldErrors((prev) => {
      const next = { ...prev };
      delete next.mediaIds;
      return next;
    });
  };

  const selectAllArtworkMedia = () => {
    const allIds = artworkMedia.map((item) => item._id);
    setSelectedArtworkMediaIds(allIds);
    setArtworkFieldErrors((prev) => {
      const next = { ...prev };
      delete next.mediaIds;
      return next;
    });
  };

  const clearArtworkSelection = () => {
    setSelectedArtworkMediaIds([]);
  };

  const selectFailedBulkItems = () => {
    const failedIds = bulkResults.filter((item) => !item.ok).map((item) => item.mediaId);
    if (failedIds.length) {
      setSelectedArtworkMediaIds(failedIds);
    }
  };

  const deriveBulkTitle = (item: MediaItem) => {
    const baseName = (item.filename || item.s3Key || "Artwork").replace(/\.[^/.]+$/, "");
    const fallback = baseName.trim() || "Artwork";
    if (bulkDefaults.titleStrategy === "prefix") {
      const prefix = bulkDefaults.titlePrefix.trim();
      return `${prefix ? `${prefix} ` : ""}${fallback}`.trim();
    }
    return fallback;
  };

  const findMediaById = (id: string) => selectedArtworkMedia.find((media) => media._id === id);

  const createBulkRowsFromSelection = (): BulkRow[] =>
    selectedArtworkMedia.map((media) => ({
      mediaId: media._id,
      filename: media.filename || media.s3Key,
      url: media.url,
      mimeType: media.mimeType,
      title: "",
      mode: bulkDefaults.mode,
      widthCm: "",
      heightCm: "",
      shortDescription: "",
      useDefaults: true,
    }));

  const openBulkModal = () => {
    setBulkError(null);
    setBulkProgress({ done: 0, total: selectedArtworkMedia.length });
    setBulkResults([]);
    setBulkUiMode("defaults");
    setBulkRows(createBulkRowsFromSelection());
    setBulkOpen(true);
  };

  const updateBulkRow = (mediaId: string, patch: Partial<BulkRow>) => {
    setBulkRows((prev) => prev.map((row) => (row.mediaId === mediaId ? { ...row, ...patch } : row)));
  };

  const applyDefaultsToRows = () => {
    setBulkRows((prev) =>
      prev.map((row) => {
        if (!row.useDefaults) return row;
        const media = findMediaById(row.mediaId);
        const derivedTitle = media ? deriveBulkTitle(media) : row.title;
        return {
          ...row,
          mode: bulkDefaults.mode,
          widthCm: bulkDefaults.widthCm,
          heightCm: bulkDefaults.heightCm,
          shortDescription: bulkDefaults.shortDescription,
          title: derivedTitle,
        };
      }),
    );
  };

  const clearBulkRows = () => {
    setBulkRows((prev) =>
      prev.map((row) => ({
        ...row,
        title: "",
        widthCm: "",
        heightCm: "",
        shortDescription: "",
      })),
    );
  };

  const copyFirstRowToAllRows = () => {
    setBulkRows((prev) => {
      if (!prev.length) return prev;
      const [first, ...rest] = prev;
      return [
        first,
        ...rest.map((row) => ({
          ...row,
          title: first.title,
          mode: first.mode,
          widthCm: first.widthCm,
          heightCm: first.heightCm,
          shortDescription: first.shortDescription,
        })),
      ];
    });
  };

  const autoTitleRowsFromFilename = () => {
    setBulkRows((prev) =>
      prev.map((row) => {
        const media = findMediaById(row.mediaId);
        const derivedTitle = media ? deriveBulkTitle(media) : row.title;
        return { ...row, title: derivedTitle };
      }),
    );
  };

  const handleCancelBulk = () => {
    bulkCancelRef.current = true;
    bulkAbortController.current?.abort();
  };

  const handleStartBulkCreate = async (rowsOverride?: BulkRow[]) => {
    setBulkError(null);
    if (!artistShopifyMetaobjectId) {
      setBulkError("Artist is not linked to Shopify.");
      return;
    }

    const sourceRows = rowsOverride || (bulkUiMode === "table" ? bulkRows : null);

    const tasks: Array<{
      media: MediaItem;
      title: string;
      saleMode: ArtworkSaleMode;
      widthCm: number | null;
      heightCm: number | null;
      shortDescription: string | null;
    }> = [];

    if (sourceRows) {
      if (!sourceRows.length) {
        setBulkError("Select at least one artwork media.");
        return;
      }
      for (const row of sourceRows) {
        const media = findMediaById(row.mediaId);
        if (!media) {
          setBulkError("Some selected media are missing.");
          return;
        }
        const widthRaw = row.widthCm.trim() || (row.useDefaults ? bulkDefaults.widthCm.trim() : "");
        const heightRaw = row.heightCm.trim() || (row.useDefaults ? bulkDefaults.heightCm.trim() : "");
        const widthParsed = widthRaw ? Number(widthRaw) : null;
        const heightParsed = heightRaw ? Number(heightRaw) : null;
        if (widthRaw && Number.isNaN(widthParsed)) {
          setBulkError(`Width must be a number for ${row.filename}.`);
          return;
        }
        if (heightRaw && Number.isNaN(heightParsed)) {
          setBulkError(`Height must be a number for ${row.filename}.`);
          return;
        }
        const shortDescription = row.shortDescription.trim() || (row.useDefaults ? bulkDefaults.shortDescription.trim() : "") || null;
        const saleModeRaw = row.useDefaults ? bulkDefaults.mode : row.mode;
        const saleMode = saleModeRaw === "PRINT_ONLY" ? "PRINT_ONLY" : "ORIGINAL_AND_PRINTS";
        const title = row.title.trim() || deriveBulkTitle(media);
        tasks.push({
          media,
          title,
          saleMode,
          widthCm: widthParsed,
          heightCm: heightParsed,
          shortDescription,
        });
      }
    } else {
      const itemsToCreate = [...selectedArtworkMedia];
      if (itemsToCreate.length === 0) {
        setBulkError("Select at least one artwork media.");
        return;
      }

      const widthRaw = bulkDefaults.widthCm.trim();
      const heightRaw = bulkDefaults.heightCm.trim();
      if (widthRaw && Number.isNaN(Number(widthRaw))) {
        setBulkError("Width must be a number.");
        return;
      }
      if (heightRaw && Number.isNaN(Number(heightRaw))) {
        setBulkError("Height must be a number.");
        return;
      }

      const widthParsed = widthRaw ? Number(widthRaw) : null;
      const heightParsed = heightRaw ? Number(heightRaw) : null;
      const kurzbeschreibung = bulkDefaults.shortDescription.trim() || null;
      const modeToSend: ArtworkSaleMode = bulkDefaults.mode === "PRINT_ONLY" ? "PRINT_ONLY" : "ORIGINAL_AND_PRINTS";

      for (const mediaItem of itemsToCreate) {
        tasks.push({
          media: mediaItem,
          title: deriveBulkTitle(mediaItem),
          saleMode: modeToSend,
          widthCm: widthParsed,
          heightCm: heightParsed,
          shortDescription: kurzbeschreibung,
        });
      }
    }

    if (tasks.length === 0) {
      setBulkError("Select at least one artwork media.");
      return;
    }

    const controller = new AbortController();
    bulkAbortController.current = controller;
    bulkCancelRef.current = false;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: tasks.length });
    setBulkResults([]);

    const runResults: BulkCreateResult[] = [];

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      if (bulkCancelRef.current) break;
      const derivedTitle = task.title;
      let result: BulkCreateResult | null = null;
      try {
        const res = await fetch("/api/shopify/artworks/create", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artistId,
            artistMetaobjectGid: artistShopifyMetaobjectId,
            title: derivedTitle,
            saleMode: task.saleMode,
            price: task.saleMode === "PRINT_ONLY" ? null : "0",
            editionSize: null,
            kurzbeschreibung: task.shortDescription,
            widthCm: task.widthCm,
            heightCm: task.heightCm,
            description: null,
            mediaIds: [task.media._id],
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message = parseErrorMessage(payload) || `Request failed (${res.status})`;
          throw new Error(message);
        }

        const payload = (await res.json().catch(() => ({}))) as any;
        const productGid = (payload?.productGid as string | undefined) || null;
        const productId = parseProductIdFromGid(productGid);
        const handle = (payload?.handle as string | undefined) || null;
        const createdTitle = (payload?.title as string | undefined) || derivedTitle;

        result = {
          ok: true,
          mediaId: task.media._id,
          mediaFilename: task.media.filename || task.media.s3Key,
          title: createdTitle,
          productGid,
          productId,
          handle,
          adminUrl: null,
        };
      } catch (err: any) {
        if (err?.name === "AbortError") {
          break;
        }
        result = {
          ok: false,
          mediaId: task.media._id,
          mediaFilename: task.media.filename || task.media.s3Key,
          title: derivedTitle,
          error: err?.message || "Failed to create draft",
        };
      }

      if (result) {
        runResults.push(result);
        setBulkResults([...runResults]);
        setBulkProgress({ done: runResults.length, total: tasks.length });
      }

      if (bulkCancelRef.current) {
        break;
      }

      if (index < tasks.length - 1) {
        await sleep(600);
      }
    }

    setBulkProgress({ done: runResults.length, total: tasks.length });
    bulkAbortController.current = null;
    setBulkRunning(false);

    if (runResults.some((item) => item.ok)) {
      const products = await refreshShopifyProducts();
      const mapped = runResults.map((item) => {
        if (!item.ok) return item;
        const targetId = item.productId || parseProductIdFromGid(item.productGid);
        const match = products.find((product) => {
          const productId = parseProductIdFromGid(product.id);
          return (targetId && productId === targetId) || (item.handle && product.handle === item.handle);
        });
        return {
          ...item,
          adminUrl: match?.shopifyAdminUrl || item.adminUrl || null,
          productId: item.productId || targetId || parseProductIdFromGid(match?.id) || null,
          title: item.title || match?.title || item.mediaFilename,
        };
      });
      setBulkResults(mapped);
    }
  };

  const handleRetryFailedOnly = () => {
    const failedIds = bulkResults.filter((item) => !item.ok).map((item) => item.mediaId);
    const rowsToRetry = bulkRows.filter((row) => failedIds.includes(row.mediaId));
    if (!failedIds.length || rowsToRetry.length === 0) {
      setBulkError("No failed rows to retry.");
      return;
    }
    setBulkUiMode("table");
    handleStartBulkCreate(rowsToRetry);
  };

  const validateArtworkForm = () => {
    const errors: ArtworkFieldErrors = {};
    if (selectedArtworkMediaIds.length === 0) {
      errors.mediaIds = "Please select at least one image.";
    }
    if (!artworkTitle.trim()) {
      errors.title = "Title is required.";
    }
    const priceValue = artworkPrice.trim();
    const priceRequired = artworkSaleMode !== "PRINT_ONLY";
    if (priceRequired && !priceValue) {
      errors.price = "Price is required for this sale mode.";
    }
    if (priceValue) {
      const parsedPrice = Number(priceValue);
      if (Number.isNaN(parsedPrice)) {
        errors.price = "Price must be a number.";
      } else if (parsedPrice <= 0) {
        errors.price = "Price must be greater than 0.";
      }
    }
    if (artworkEditionSize.trim() && Number.isNaN(Number(artworkEditionSize.trim()))) {
      errors.editionSize = "Edition size must be a number.";
    }
    if (artworkWidthCm.trim() && Number.isNaN(Number(artworkWidthCm.trim()))) {
      errors.widthCm = "Width must be a number.";
    }
    if (artworkHeightCm.trim() && Number.isNaN(Number(artworkHeightCm.trim()))) {
      errors.heightCm = "Height must be a number.";
    }
    return errors;
  };

  const handleCreateArtwork = async () => {
    setArtworkFormError(null);
    setArtworkSuccess(null);
    setArtworkSuccessAdminUrl(null);
    const errors = validateArtworkForm();
    setArtworkFieldErrors(errors);
    if (Object.keys(errors).length) return;
    if (!artistShopifyMetaobjectId) {
      setArtworkFormError("Artist is not linked to Shopify.");
      return;
    }

    setArtworkSubmitting(true);
    const saleModeToSend: ArtworkSaleMode = artworkSaleMode === "PRINT_ONLY" ? "PRINT_ONLY" : "ORIGINAL_AND_PRINTS";
    const priceValue = artworkPrice.trim();
    const priceToSend = saleModeToSend === "PRINT_ONLY" ? (priceValue ? priceValue : null) : priceValue;
    try {
      const res = await fetch("/api/shopify/artworks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          artistMetaobjectGid: artistShopifyMetaobjectId,
          title: artworkTitle.trim(),
          saleMode: saleModeToSend,
          price: priceToSend,
          editionSize: artworkEditionSize.trim() || null,
          kurzbeschreibung: artworkKurzbeschreibung.trim() || null,
          widthCm: artworkWidthCm.trim() ? Number(artworkWidthCm.trim()) : null,
          heightCm: artworkHeightCm.trim() ? Number(artworkHeightCm.trim()) : null,
          description: artworkDescription.trim() || null,
          mediaIds: selectedArtworkMediaIds,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.fieldErrors) {
          setArtworkFieldErrors(payload.fieldErrors);
        }
        throw new Error(parseErrorMessage(payload));
      }

      const payload = await res.json().catch(() => ({}));
      const createdHandle = payload?.handle as string | undefined;
      setArtworkSuccess("Artwork created in Shopify.");
      resetArtworkForm();
      const products = await refreshShopifyProducts();
      const createdProduct = createdHandle ? products.find((product) => product.handle === createdHandle) : undefined;
      setArtworkSuccessAdminUrl(createdProduct?.shopifyAdminUrl || null);
    } catch (err: any) {
      setArtworkFormError(err?.message ?? "Failed to create artwork");
    } finally {
      setArtworkSubmitting(false);
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
                  <div className="flex flex-wrap gap-2">
                    {item.url && (
                      <button
                        type="button"
                        onClick={() => handleSetHeroImage(item)}
                        className="text-xs text-blue-600 underline"
                      >
                        Set as Hero Image
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteMedia(item._id)}
                      className="text-xs text-red-600 underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const artworksHeader = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-lg font-semibold text-slate-800">Artworks</h3>
        <p className="text-xs text-slate-500">
          Upload artwork images inline, preview, select, and create Shopify draft products without leaving this tab.
        </p>
      </div>
      {shopifyProductsLoading && <span className="text-xs text-slate-500">Loading Shopify...</span>}
    </div>
  );

  const artworkPriceValue = artworkPrice.trim();
  const artworkPriceRequired = artworkSaleMode !== "PRINT_ONLY";
  const artworkPriceInvalid = artworkPriceValue ? Number.isNaN(Number(artworkPriceValue)) || Number(artworkPriceValue) <= 0 : false;
  const isCreateArtworkDisabled =
    artworkSubmitting ||
    !artworkTitle.trim() ||
    selectedArtworkMediaIds.length === 0 ||
    (artworkPriceRequired && (!artworkPriceValue || artworkPriceInvalid));

  const artworksContent = (
    <div className="space-y-4">
      {!artist?.shopifySync?.metaobjectId && (
        <p className="text-sm text-slate-600">No Shopify artist linked yet. Sync to Shopify first.</p>
      )}

      {artist?.shopifySync?.metaobjectId && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingArtworkUpload(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDraggingArtworkUpload(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDraggingArtworkUpload(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingArtworkUpload(false);
                handleUploadArtworkMedia(e.dataTransfer?.files || null);
              }}
              className={`rounded-lg border-2 border-dashed bg-slate-50 p-4 transition ${
                draggingArtworkUpload ? "border-slate-900" : "border-slate-300"
              }`}
            >
              <input
                ref={artworkUploadInputRef}
                type="file"
                accept="image/*,video/*,.pdf"
                multiple
                className="hidden"
                onChange={(e) => handleUploadArtworkMedia(e.target.files)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Upload artwork images</p>
                  <p className="text-xs text-slate-600">
                    Files go to /api/media with kind=&quot;artwork&quot;, show instantly, and are auto-selected for creation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => artworkUploadInputRef.current?.click()}
                  disabled={artworkGalleryUploading}
                  className="inline-flex items-center rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {artworkGalleryUploading ? "Uploading..." : "Select files"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Drag & drop images or tap to browse. Accepted: images, videos, PDFs.</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">Selected:</span>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                  {selectedArtworkMediaIds.length}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllArtworkMedia}
                  disabled={artworkMedia.length === 0}
                  className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearArtworkSelection}
                  disabled={selectedArtworkMediaIds.length === 0}
                  className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            </div>
            {artworkFieldErrors.mediaIds && <p className="text-xs text-red-600">{artworkFieldErrors.mediaIds}</p>}
            {mediaError && <p className="text-sm text-red-600">{mediaError}</p>}
            {selectedArtworkMediaIds.length > 0 && (
              <div className="sticky top-0 z-10 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
                <div className="text-sm font-semibold text-slate-900">
                  Actions for {selectedArtworkMediaIds.length} selected
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCreateArtwork()}
                    disabled={artworkSubmitting}
                    className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 disabled:opacity-60"
                  >
                    Create 1 draft
                  </button>
                  <button
                    type="button"
                  onClick={() => {
                      openBulkModal();
                  }}
                  className="inline-flex items-center rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Bulk create drafts ({selectedArtworkMediaIds.length})
                </button>
                </div>
              </div>
            )}

            {mediaLoading ? (
              <p className="text-sm text-slate-600">Loading media...</p>
            ) : artworkMedia.length === 0 ? (
              <div className="rounded border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p className="font-medium text-slate-900">No artwork media yet.</p>
                <p className="text-sm text-slate-600">Upload artwork images above to start.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {artworkMedia.map((item) => {
                  const isImage = item.mimeType?.startsWith("image/");
                  const isVideo = item.mimeType?.startsWith("video/");
                  const displayName = item.filename || item.s3Key;
                  const selected = selectedArtworkMediaIds.includes(item._id);
                  return (
                    <div
                      key={item._id}
                      className={`rounded-lg border p-2 transition ${
                        selected ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleArtworkMediaSelection(item._id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="overflow-hidden rounded-md bg-slate-100">
                            {isImage && item.url ? (
                              <img src={item.url} alt={displayName} className="h-36 w-full object-cover" />
                            ) : isVideo && item.url ? (
                              <video src={item.url} className="h-36 w-full object-cover" muted playsInline />
                            ) : (
                              <div className="flex h-36 items-center justify-center text-xs text-slate-500">No preview</div>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <div className="truncate font-medium text-slate-900">{displayName}</div>
                            <span className="text-[11px] uppercase text-slate-500">{item.mimeType?.split("/")[1] || "file"}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <button
                              type="button"
                              onClick={() => setPreviewMedia(item)}
                              className="text-blue-600 underline"
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedia(item._id)}
                              className="text-red-600 underline"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form
            className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateArtwork();
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Create artwork in Shopify</p>
                <p className="text-sm text-slate-700">Selected media attach automatically as product images.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {selectedArtworkMediaIds.length} selected
              </span>
            </div>

            {artworkFormError && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{artworkFormError}</div>
            )}
            {artworkSuccess && (
              <div className="space-y-1 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                <div>{artworkSuccess}</div>
                {artworkSuccessAdminUrl && (
                  <a
                    href={artworkSuccessAdminUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 underline"
                  >
                    Open draft in Shopify admin
                  </a>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Title <span className="text-red-600">*</span>
                <input
                  value={artworkTitle}
                  onChange={(e) => setArtworkTitle(e.target.value)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="Artwork title"
                />
                {artworkFieldErrors.title && <p className="text-xs text-red-600">{artworkFieldErrors.title}</p>}
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Sale type <span className="text-red-600">*</span>
                <select
                  value={artworkSaleMode}
                  onChange={(e) => setArtworkSaleMode(e.target.value as ArtworkSaleMode)}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {saleModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">{saleModeOptions.find((option) => option.value === artworkSaleMode)?.helper}</p>
                {artworkFieldErrors.saleMode && <p className="text-xs text-red-600">{artworkFieldErrors.saleMode}</p>}
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Price {artworkSaleMode !== "PRINT_ONLY" && <span className="text-red-600">*</span>}
              <input
                value={artworkPrice}
                onChange={(e) => setArtworkPrice(e.target.value)}
                inputMode="decimal"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder={artworkSaleMode === "PRINT_ONLY" ? "Optional for prints" : "e.g. 1200.00"}
              />
              <p className="text-xs text-slate-500">
                {artworkSaleMode === "PRINT_ONLY"
                  ? "Leave blank to trigger print-only automation; fill if you still want a price."
                  : "Required for originals (+ prints) and must be greater than 0."}
              </p>
              {artworkFieldErrors.price && <p className="text-xs text-red-600">{artworkFieldErrors.price}</p>}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Width (cm)
                <input
                  value={artworkWidthCm}
                  onChange={(e) => setArtworkWidthCm(e.target.value)}
                  type="number"
                  step="0.01"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="e.g. 50"
                />
                <p className="text-xs text-slate-500">Sends to custom.breite_cm_ (number_decimal)</p>
                {artworkFieldErrors.widthCm && <p className="text-xs text-red-600">{artworkFieldErrors.widthCm}</p>}
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Height (cm)
                <input
                  value={artworkHeightCm}
                  onChange={(e) => setArtworkHeightCm(e.target.value)}
                  type="number"
                  step="0.01"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  placeholder="e.g. 70"
                />
                <p className="text-xs text-slate-500">Sends to custom.height (number_decimal)</p>
                {artworkFieldErrors.heightCm && <p className="text-xs text-red-600">{artworkFieldErrors.heightCm}</p>}
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Short description
              <textarea
                value={artworkKurzbeschreibung}
                onChange={(e) => setArtworkKurzbeschreibung(e.target.value)}
                rows={2}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Kurze Beschreibung für Shopify"
              />
              <p className="text-xs text-slate-500">Maps to custom.kurzbeschreibung (multi_line_text_field)</p>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Edition size (optional)
              <input
                value={artworkEditionSize}
                onChange={(e) => setArtworkEditionSize(e.target.value)}
                inputMode="numeric"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="e.g. 25"
              />
              {artworkFieldErrors.editionSize && <p className="text-xs text-red-600">{artworkFieldErrors.editionSize}</p>}
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Description (optional)
              <textarea
                value={artworkDescription}
                onChange={(e) => setArtworkDescription(e.target.value)}
                rows={3}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Description/HTML"
              />
            </label>

            {selectedArtworkMediaIds.length > 0 && (
              <div className="flex gap-2 overflow-x-auto rounded border border-slate-200 bg-white p-2">
                {selectedArtworkMediaIds
                  .map((id) => artworkMedia.find((item) => item._id === id))
                  .filter(Boolean)
                  .map((item) => {
                    const media = item as MediaItem;
                    return (
                      <div key={media._id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
                        {media.url ? (
                          <img src={media.url} alt={media.filename || media.s3Key} className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-[11px] text-slate-600">
                            {media.mimeType || "file"}
                          </div>
                        )}
                        <span className="truncate max-w-[140px]">{media.filename || media.s3Key}</span>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-600">
                {selectedArtworkMediaIds.length === 0 ? "Select at least one artwork image" : "Ready to create with selected images"}
              </div>
              <button
                type="submit"
                disabled={isCreateArtworkDisabled}
                className="inline-flex items-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
              >
                {artworkSubmitting ? "Creating..." : "Create in Shopify"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-800">Existing Shopify products</h4>
          {shopifyProductsLoading && <span className="text-xs text-slate-500">Loading...</span>}
        </div>
        {!artist?.shopifySync?.metaobjectId ? (
          <p className="text-sm text-slate-600">Link the artist to Shopify to list draft products.</p>
        ) : (
          <>
            {shopifyProductsError && <p className="text-sm text-red-600">{shopifyProductsError}</p>}
            {!shopifyProductsLoading && shopifyProducts.length === 0 && !shopifyProductsError && (
              <p className="text-sm text-slate-600">No Shopify products found for this artist.</p>
            )}
            {shopifyProducts.length > 0 && (
              <ul className="grid gap-3">
                {shopifyProducts.map((product) => {
                  const hasDimensions = product.breiteCm !== null || product.heightCm !== null;
                  const dimensions = hasDimensions ? `${product.breiteCm ?? "?"} × ${product.heightCm ?? "?"} cm` : null;
                  return (
                    <li key={product.id} className="flex gap-3 rounded border border-slate-200 p-3">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.title} className="h-16 w-16 rounded object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-500">
                          No image
                        </div>
                      )}
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-slate-900">{product.title}</div>
                          <span className="text-xs text-slate-500">@{product.handle}</span>
                          {product.status && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-700">
                              {product.status}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-700">
                          <span className="text-xs uppercase text-slate-500">Price:</span> {product.firstVariantPrice || "—"}
                        </div>
                        {dimensions && <div className="text-sm text-slate-700">Size: {dimensions}</div>}
                        {product.kurzbeschreibung && (
                          <p
                            className="text-sm text-slate-600"
                            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                          >
                            {product.kurzbeschreibung}
                          </p>
                        )}
                        {product.shopifyAdminUrl && (
                          <a
                            href={product.shopifyAdminUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 underline"
                          >
                            Open in Shopify
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );

  const overviewPanel = (
    <div className="space-y-4">
      <div className="ac-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Next actions</h3>
          <span className="text-xs font-medium text-slate-500">Stage: {formatStage(stage)}</span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {checklistItems
            .filter((item) => {
              if (item.key === "contracts") return stageIndex >= stageOrder.indexOf("Offer");
              if (item.key === "publicProfile" || item.key === "payout") return isUnderContract;
              return true;
            })
            .map((item) => {
              const availability = tabAvailability[item.key];
              const locked = !availability.enabled;
              const statusLabel = item.done ? "Done" : locked ? availability.reason || "Locked" : "Missing";
              const statusTone = item.done
                ? "bg-green-50 text-green-700 border-green-100"
                : locked
                  ? "bg-slate-50 text-slate-700 border-slate-100"
                  : "bg-amber-50 text-amber-700 border-amber-100";
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => goToTab(item.key)}
                    className="flex w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-300"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">{item.label}</div>
                      <div className="text-xs text-slate-600">
                        {locked ? availability.reason : item.done ? "Completed" : "Tap to complete this step"}
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>{statusLabel}</span>
                  </button>
                </li>
              );
            })}
        </ul>
      </div>

      <div className="ac-card space-y-4">
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
        </div>
      </div>

      <div className="ac-card">
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
      </div>
    </div>
  );

  const mediaPanel = (
    <div className="ac-card space-y-4">
      {mediaHeader}
      <div className="space-y-4">{mediaContent}</div>
    </div>
  );

  const artworksPanel = (
    <div className="ac-card space-y-4">
      {artworksHeader}
      <div className="space-y-4">{artworksContent}</div>
    </div>
  );

  const publicProfilePanel = (
    <div className="ac-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Public Profile (required for Under Contract)</h3>
        {lastShopifyStatus && (
          <span className="text-xs text-slate-500">
            Status: {lastShopifyStatus}
            {lastShopifySyncedAt && ` • ${new Date(lastShopifySyncedAt).toLocaleString()}`}
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
        {renderShopifyFileField(
          "bilder",
          "Titelbild (Shopify File ID / GID)",
          publicBilder,
          setPublicBilder,
        )}
        {renderShopifyFileField(
          "bild_1",
          "Bild 1 (Shopify File ID / GID)",
          publicBild1,
          setPublicBild1,
        )}
        {renderShopifyFileField(
          "bild_2",
          "Bild 2 (Shopify File ID / GID)",
          publicBild2,
          setPublicBild2,
        )}
        {renderShopifyFileField(
          "bild_3",
          "Bild 3 (Shopify File ID / GID)",
          publicBild3,
          setPublicBild3,
        )}
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
      {lastShopifyError && <p className="text-sm text-red-600">Last error: {lastShopifyError}</p>}

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
  );

  const contractsPanel = (
    <div className="ac-card space-y-4">
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
  );

  const payoutPanel = (
    <div className="ac-card space-y-4">
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
  );

  const tabPanels: Record<TabKey, ReactElement> = {
    overview: overviewPanel,
    media: mediaPanel,
    artworks: artworksPanel,
    publicProfile: publicProfilePanel,
    contracts: contractsPanel,
    payout: payoutPanel,
  };

  const tabs: Array<{ key: TabKey; label: string; chip?: string }> = [
    { key: "overview", label: "Overview", chip: overviewStatusChip },
    { key: "media", label: "Media", chip: mediaStatusChip },
    { key: "artworks", label: "Artworks", chip: artworksStatusChip },
    { key: "publicProfile", label: "Public Profile", chip: publicProfileStatusChip },
    { key: "contracts", label: "Contracts", chip: contractsStatusChip },
    { key: "payout", label: "Payout", chip: payoutStatusChip },
  ];
  const bulkRunCount = bulkUiMode === "table" ? bulkRows.length : selectedArtworkMedia.length;
  const bulkTotal = bulkProgress.total || bulkRunCount;
  const bulkProgressPercent = bulkTotal ? Math.min(100, Math.round((bulkProgress.done / bulkTotal) * 100)) : 0;
  const bulkSuccessCount = bulkResults.filter((item) => item.ok).length;
  const bulkFailureCount = bulkResults.filter((item) => !item.ok).length;
  const previewItems =
    bulkUiMode === "table"
      ? bulkRows.map((row) => ({ id: row.mediaId, label: row.filename }))
      : selectedArtworkMedia.map((item) => ({ id: item._id, label: item.filename || item.s3Key }));

  const bulkModal = !bulkOpen ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900">Bulk create Shopify drafts</div>
            <div className="text-xs text-slate-600">
              {bulkRunCount} media selected • sequential with 600ms delay
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-slate-200 bg-slate-100 p-1 text-xs font-semibold text-slate-700">
              <button
                type="button"
                onClick={() => setBulkUiMode("defaults")}
                className={`rounded-full px-2 py-1 transition ${bulkUiMode === "defaults" ? "bg-white shadow-sm" : "hover:bg-white/60"}`}
              >
                Simple defaults
              </button>
              <button
                type="button"
                onClick={() => setBulkUiMode("table")}
                className={`rounded-full px-2 py-1 transition ${bulkUiMode === "table" ? "bg-white shadow-sm" : "hover:bg-white/60"}`}
              >
                Table (per media)
              </button>
            </div>
            {bulkRunning && (
              <button
                type="button"
                onClick={handleCancelBulk}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 hover:border-slate-400"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              disabled={bulkRunning}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-60"
            >
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto p-4 space-y-4">
          {!artistShopifyMetaobjectId && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Link the artist to Shopify before creating drafts.
            </div>
          )}

          {bulkUiMode === "defaults" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Create mode
                  <select
                    value={bulkDefaults.mode}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, mode: e.target.value as ArtworkSaleMode }))}
                    disabled={bulkRunning}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                  >
                    {saleModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    One draft product per media. Original mode tags with \"original\" and uses a placeholder price of 0 on the draft.
                  </p>
                </label>

                <div className="space-y-1 text-sm font-medium text-slate-700">
                  <div className="space-y-1">
                    <span>Title strategy</span>
                    <select
                      value={bulkDefaults.titleStrategy}
                      onChange={(e) => setBulkDefaults((prev) => ({ ...prev, titleStrategy: e.target.value as BulkTitleStrategy }))}
                      disabled={bulkRunning}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    >
                      <option value="filename">Use filename</option>
                      <option value="prefix">Prefix + filename</option>
                    </select>
                  </div>
                  {bulkDefaults.titleStrategy === "prefix" && (
                    <input
                      value={bulkDefaults.titlePrefix}
                      onChange={(e) => setBulkDefaults((prev) => ({ ...prev, titlePrefix: e.target.value }))}
                      disabled={bulkRunning}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                      placeholder="Prefix (optional)"
                    />
                  )}
                  <p className="text-xs font-normal text-slate-500">
                    Titles derive from media filenames; prefix adds a shared intro.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Width (cm)
                  <input
                    type="number"
                    step="0.01"
                    value={bulkDefaults.widthCm}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, widthCm: e.target.value }))}
                    disabled={bulkRunning}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    placeholder="e.g. 50"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Height (cm)
                  <input
                    type="number"
                    step="0.01"
                    value={bulkDefaults.heightCm}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, heightCm: e.target.value }))}
                    disabled={bulkRunning}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    placeholder="e.g. 70"
                  />
                </label>
                <label className="sm:col-span-3 space-y-1 text-sm font-medium text-slate-700">
                  Short description
                  <textarea
                    value={bulkDefaults.shortDescription}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    disabled={bulkRunning}
                    rows={2}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    placeholder="kurzbeschreibung (optional)"
                  />
                  <p className="text-xs font-normal text-slate-500">Left empty fields stay empty on the created drafts.</p>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Apply defaults to rows</div>
                  <div className="text-xs text-slate-600">Rows with \"Use defaults\" checked will receive these values.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={applyDefaultsToRows}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                  >
                    Apply defaults to all rows
                  </button>
                  <button
                    type="button"
                    onClick={clearBulkRows}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={copyFirstRowToAllRows}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                  >
                    Copy first row to all
                  </button>
                  <button
                    type="button"
                    onClick={autoTitleRowsFromFilename}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                  >
                    Auto-title from filename
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Create mode
                  <select
                    value={bulkDefaults.mode}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, mode: e.target.value as ArtworkSaleMode }))}
                    disabled={bulkRunning}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                  >
                    {saleModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-1 text-sm font-medium text-slate-700">
                  <div className="space-y-1">
                    <span>Title strategy</span>
                    <select
                      value={bulkDefaults.titleStrategy}
                      onChange={(e) => setBulkDefaults((prev) => ({ ...prev, titleStrategy: e.target.value as BulkTitleStrategy }))}
                      disabled={bulkRunning}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    >
                      <option value="filename">Use filename</option>
                      <option value="prefix">Prefix + filename</option>
                    </select>
                  </div>
                  {bulkDefaults.titleStrategy === "prefix" && (
                    <input
                      value={bulkDefaults.titlePrefix}
                      onChange={(e) => setBulkDefaults((prev) => ({ ...prev, titlePrefix: e.target.value }))}
                      disabled={bulkRunning}
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                      placeholder="Prefix (optional)"
                    />
                  )}
                </div>
                <div className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Short description (default)</span>
                  <textarea
                    value={bulkDefaults.shortDescription}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, shortDescription: e.target.value }))}
                    disabled={bulkRunning}
                    rows={2}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    placeholder="kurzbeschreibung"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Width (cm)
                  <input
                    type="number"
                    step="0.01"
                    value={bulkDefaults.widthCm}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, widthCm: e.target.value }))}
                    disabled={bulkRunning}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    placeholder="e.g. 50"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Height (cm)
                  <input
                    type="number"
                    step="0.01"
                    value={bulkDefaults.heightCm}
                    onChange={(e) => setBulkDefaults((prev) => ({ ...prev, heightCm: e.target.value }))}
                    disabled={bulkRunning}
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                    placeholder="e.g. 70"
                  />
                </label>
              </div>

              <div className="overflow-auto rounded border border-slate-200">
                <table className="ac-table min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Preview</th>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2">Width (cm)</th>
                      <th className="px-3 py-2">Height (cm)</th>
                      <th className="px-3 py-2">Short description</th>
                      <th className="px-3 py-2">Use defaults</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.length === 0 && (
                      <tr>
                        <td className="px-3 py-2 text-sm text-slate-600" colSpan={7}>
                          No rows. Close and reopen after selecting media.
                        </td>
                      </tr>
                    )}
                    {bulkRows.map((row) => {
                      const media = findMediaById(row.mediaId);
                      const isImage = media?.mimeType?.startsWith("image/");
                      return (
                        <tr key={row.mediaId} className="border-t border-slate-200">
                          <td className="px-3 py-2 align-top">
                            <div className="flex gap-2">
                              {isImage && media?.url ? (
                                <img src={media.url} alt={row.filename} className="h-12 w-12 rounded object-cover" />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-[11px] text-slate-600">
                                  {media?.mimeType || "file"}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-slate-800">{row.filename}</div>
                                <div className="text-[11px] text-slate-500">{media?.mimeType || "file"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <input
                              value={row.title}
                              onChange={(e) => updateBulkRow(row.mediaId, { title: e.target.value })}
                              disabled={bulkRunning}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                              placeholder="Title (optional)"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={row.mode}
                              onChange={(e) => updateBulkRow(row.mediaId, { mode: e.target.value as ArtworkSaleMode })}
                              disabled={bulkRunning}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                            >
                              {saleModeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <input
                              type="number"
                              step="0.01"
                              value={row.widthCm}
                              onChange={(e) => updateBulkRow(row.mediaId, { widthCm: e.target.value })}
                              disabled={bulkRunning}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                              placeholder="cm"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <input
                              type="number"
                              step="0.01"
                              value={row.heightCm}
                              onChange={(e) => updateBulkRow(row.mediaId, { heightCm: e.target.value })}
                              disabled={bulkRunning}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                              placeholder="cm"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <textarea
                              value={row.shortDescription}
                              onChange={(e) => updateBulkRow(row.mediaId, { shortDescription: e.target.value })}
                              disabled={bulkRunning}
                              rows={2}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:bg-slate-50"
                              placeholder="kurzbeschreibung"
                            />
                          </td>
                          <td className="px-3 py-2 align-top">
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={row.useDefaults}
                                onChange={(e) => updateBulkRow(row.mediaId, { useDefaults: e.target.checked })}
                                disabled={bulkRunning}
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                              />
                              <span>Use defaults</span>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {bulkError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{bulkError}</div>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              Uses /api/shopify/artworks/create per media and continues on errors. Cancel stops the remaining calls.
            </div>
            <div className="flex items-center gap-2">
              {bulkRunning && (
                <button
                  type="button"
                  onClick={handleCancelBulk}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                >
                  Cancel run
                </button>
              )}
              <button
                type="button"
                onClick={() => handleStartBulkCreate()}
                disabled={bulkRunning || !bulkRunCount || !artistShopifyMetaobjectId}
                className="inline-flex items-center rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
              >
                {bulkRunning ? "Running..." : `Start bulk create (${bulkRunCount})`}
              </button>
            </div>
          </div>

          {(bulkRunning || bulkResults.length > 0) && (
            <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>Progress</span>
                <span>
                  Created {bulkProgress.done} / {bulkTotal || 0}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-slate-900 transition-all" style={{ width: `${bulkProgressPercent}%` }} />
              </div>
            </div>
          )}

          {bulkRunCount > 0 && (
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>Will create for</span>
                <span className="text-xs text-slate-600">{bulkRunCount} media</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                {previewItems.slice(0, 8).map((item) => (
                  <span key={item.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                    {item.label}
                  </span>
                ))}
                {bulkRunCount > 8 && (
                  <span className="text-xs text-slate-600">+ {bulkRunCount - 8} more</span>
                )}
              </div>
            </div>
          )}

          {bulkResults.length > 0 && (
            <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">
                  Results: {bulkSuccessCount} ok / {bulkResults.length} total
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {bulkFailureCount > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={selectFailedBulkItems}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                      >
                        Select failed ({bulkFailureCount})
                      </button>
                      <button
                        type="button"
                        onClick={handleRetryFailedOnly}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                      >
                        Retry failed only
                      </button>
                    </>
                  )}
                  {!bulkRunning && (
                    <button
                      type="button"
                      onClick={() => setBulkResults([])}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-800 shadow-sm hover:border-slate-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <ul className="max-h-64 space-y-2 overflow-auto pr-1">
                {bulkResults.map((result, idx) => (
                  <li
                    key={`${result.mediaId}-${result.productId || result.handle || idx}`}
                    className={`rounded border px-3 py-2 ${
                      result.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    {result.ok ? (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
                            <span role="img" aria-label="success">
                              ✅
                            </span>
                            <span className="truncate">{result.title}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                            {result.adminUrl && (
                              <a
                                href={result.adminUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-green-800 underline"
                              >
                                Open in Shopify
                              </a>
                            )}
                            {result.productId && (
                              <button
                                type="button"
                                onClick={() => navigator.clipboard?.writeText(result.productId || "").catch(() => {})}
                                className="rounded border border-green-300 bg-white px-2 py-1 text-[11px] font-semibold text-green-800 shadow-sm hover:border-green-400"
                              >
                                Copy productId
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-green-800">Media: {result.mediaFilename}</div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
                          <span role="img" aria-label="error">
                            ❌
                          </span>
                          <span>{result.mediaFilename}</span>
                        </div>
                        <div className="text-xs text-red-800">{result.error || "Failed to create draft"}</div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const previewModal = !previewMedia ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="truncate text-sm font-semibold text-slate-800">{previewMedia.filename || previewMedia.s3Key}</div>
          <button
            type="button"
            onClick={() => setPreviewMedia(null)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300"
          >
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-auto p-4 space-y-2">
          <div className="text-xs text-slate-600">
            {previewMedia.mimeType || "Unknown type"} • {previewMedia.kind}
          </div>
          {previewMedia.url && previewMedia.mimeType?.startsWith("image/") && (
            <img src={previewMedia.url} alt={previewMedia.filename || previewMedia.s3Key} className="h-auto w-full rounded-lg object-contain" />
          )}
          {previewMedia.url && previewMedia.mimeType?.startsWith("video/") && (
            <video
              src={previewMedia.url}
              controls
              className="w-full rounded-lg"
              style={{ maxHeight: "70vh" }}
            />
          )}
          {previewMedia.url && !previewMedia.mimeType?.startsWith("image/") && !previewMedia.mimeType?.startsWith("video/") && (
            <div className="space-y-2 text-sm text-slate-700">
              <p>No inline preview for this file. You can download or open it below.</p>
              <a href={previewMedia.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                Open file
              </a>
            </div>
          )}
          {!previewMedia.url && (
            <p className="text-sm text-slate-700">No preview URL available for this file.</p>
          )}
        </div>
      </div>
    </div>
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
    <>
      <section className="page space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">ID</div>
            <div className="break-all font-mono text-sm text-slate-700">{artist._id}</div>
          </div>
          <Link href="/admin/artists" className="text-sm text-blue-600 underline">
            Back to artists
          </Link>
        </div>

        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6">
          <div className="ac-card ac-blur mx-4 sm:mx-6 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Stage
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as Stage)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    {stageOptions.map((s) => (
                      <option key={s} value={s}>
                        {formatStage(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {contextualCta && (
                  <button
                    type="button"
                    onClick={contextualCta.action}
                    disabled={contextualCta.disabled}
                    className="inline-flex items-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {contextualCta.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSyncShopify}
                  disabled={shopifySyncing || !isUnderContract || !canSync}
                  title={!isUnderContract ? "Sync is available in Under Contract stage" : !canSync ? "Name und text_1 erforderlich" : undefined}
                  className="inline-flex items-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-400 disabled:opacity-60"
                >
                  {shopifySyncing ? "Syncing..." : "Sync to Shopify"}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-400 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {statusBadges.map((badge) => (
                <span key={badge.label} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${badge.tone}`}>
                  <span className="text-xs">{badge.label}:</span> {badge.text}
                </span>
              ))}
              {lastShopifyStatus && (
                <span className="text-xs text-slate-600">
                  Shopify: {lastShopifyStatus}
                  {lastShopifySyncedAt && ` • ${new Date(lastShopifySyncedAt).toLocaleString()}`}
                </span>
              )}
              {saveMessage && (
                <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
                  {saveMessage}
                </span>
              )}
              {shopifyMessage && (
                <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
                  {shopifyMessage}
                </span>
              )}
              {shopifyError && (
                <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
                  {shopifyError}
                </span>
              )}
              {lastShopifyError && (
                <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
                  Last Shopify error: {lastShopifyError}
                </span>
              )}
              {error && (
                <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">{error}</span>
              )}
            </div>
          </div>
        </div>

        {!isUnderContract && (
          <div className="ac-card p-3">
            <div className="flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <p>Sections unlock as the stage advances. Media/Artworks start in In Review, Contracts in Offer, Public Profile and Payout in Under Contract.</p>
              <p className="text-xs text-slate-500">Change the stage in the header to progress.</p>
            </div>
          </div>
        )}

        <nav className="segmented">
          {tabs.map((tab) => {
            const availability = tabAvailability[tab.key];
            const disabled = !availability.enabled;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                disabled={disabled}
                title={disabled ? availability.reason : undefined}
                className={`flex items-center gap-2 ${isActive ? "active" : ""} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span>{tab.label}</span>
                {tab.chip && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {tab.chip}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4">
          {tabAvailability[activeTab].enabled ? (
            tabPanels[activeTab]
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
              This section is locked. {tabAvailability[activeTab].reason || "Change the stage to continue."}
            </div>
          )}
        </div>
      </section>
      {bulkModal}
      {previewModal}
    </>
  );
}
