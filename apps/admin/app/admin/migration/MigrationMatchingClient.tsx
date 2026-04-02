"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UserOption = {
  id: string;
  label: string;
  email: string;
  artistKey: string;
};

type ArtistSuggestion = UserOption & {
  score: number;
  reasons: string[];
};

type ImportedArtistRow = {
  artistKey: string;
  displayName: string;
  email: string;
  handle: string;
  publicSlug: string;
  shopifyMetaobjectId: string;
  appUrl: string;
  linkedUserId: string;
  vendorHints: string[];
  migrationStatus: string;
  linkStatus: "unlinked" | "suggested" | "linked" | "needs_review";
  suggestions: ArtistSuggestion[];
};

type ArtistOption = {
  artistKey: string;
  label: string;
  publicSlug: string;
  shopifyMetaobjectId: string;
};

type ProductSuggestion = ArtistOption & {
  score: number;
  reasons: string[];
};

type ImportedProductRow = {
  productKey: string;
  title: string;
  vendor: string;
  handle: string;
  thumbUrl: string;
  artistKey: string;
  artistRef: string;
  shopifyProductId: string;
  migrationStatus: "unassigned" | "suggested" | "assigned" | "needs_review";
  suggestions: ProductSuggestion[];
};

type Props = {
  mode?: "accounts" | "artworks";
  bucket?: "open" | "completed" | "error";
  nextSignal?: number;
  onResult?: (message: string) => void;
};

type ResultState = {
  tone: "success" | "error";
  message: string;
} | null;

type ClassifiedArtist = ImportedArtistRow & {
  queueBucket: "open" | "completed" | "error";
  queueReason: string;
};

type ClassifiedProduct = ImportedProductRow & {
  queueBucket: "open" | "completed" | "error";
  queueReason: string;
};

function toneClass(tone: "success" | "error") {
  return tone === "success"
    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border border-rose-200 bg-rose-50 text-rose-700";
}

function badgeTone(status: string) {
  switch (status) {
    case "linked":
    case "assigned":
      return "bg-emerald-50 text-emerald-700";
    case "suggested":
    case "needs_review":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function classifyArtist(item: ImportedArtistRow): ClassifiedArtist {
  if (item.linkedUserId) {
    return { ...item, queueBucket: "completed", queueReason: "Ein Account ist bereits mit diesem Künstler verknüpft." };
  }

  if (!item.email && item.suggestions.length === 0) {
    return {
      ...item,
      queueBucket: "error",
      queueReason: "Keine E-Mail und kein brauchbarer Account-Vorschlag vorhanden. Manuelle Prüfung nötig.",
    };
  }

  if (item.suggestions.length > 0) {
    return {
      ...item,
      queueBucket: "open",
      queueReason: `Vorschlag gefunden: ${item.suggestions[0].reasons.join(" · ")}`,
    };
  }

  if (!item.email) {
    return {
      ...item,
      queueBucket: "error",
      queueReason: "Es fehlt eine E-Mail. Ein neuer Account kann nicht automatisch erstellt werden.",
    };
  }

  return {
    ...item,
    queueBucket: item.linkStatus === "needs_review" ? "error" : "open",
    queueReason:
      item.linkStatus === "needs_review"
        ? "Kein sicherer Match vorhanden. Bestehenden Account wählen oder neuen Account anlegen."
        : "Neuen Account anlegen oder vorhandenen Account auswählen und bestätigen.",
  };
}

function classifyProduct(item: ImportedProductRow): ClassifiedProduct {
  if (item.artistKey) {
    return { ...item, queueBucket: "completed", queueReason: "Dieses Kunstwerk ist bereits einem Künstler zugeordnet." };
  }

  if (item.suggestions.length === 0 && !item.vendor && !item.artistRef) {
    return {
      ...item,
      queueBucket: "error",
      queueReason: "Kein Artist-Signal vorhanden. Bitte manuell auswählen.",
    };
  }

  if (item.suggestions.length > 0) {
    return {
      ...item,
      queueBucket: "open",
      queueReason: `Vorschlag gefunden: ${item.suggestions[0].reasons.join(" · ")}`,
    };
  }

  return {
    ...item,
    queueBucket: item.migrationStatus === "needs_review" ? "error" : "open",
    queueReason:
      item.migrationStatus === "needs_review"
        ? "Keine sichere Zuordnung vorhanden. Bitte Artist manuell wählen."
        : "Artist auswählen und bestätigen.",
  };
}

export default function MigrationMatchingClient({ mode = "accounts", bucket = "open", nextSignal = 0, onResult }: Props) {
  const [artists, setArtists] = useState<ImportedArtistRow[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [products, setProducts] = useState<ImportedProductRow[]>([]);
  const [artistOptions, setArtistOptions] = useState<ArtistOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [artistSelections, setArtistSelections] = useState<Record<string, { linkedUserId: string; linkStatus: string }>>({});
  const [productSelections, setProductSelections] = useState<Record<string, { artistKey: string; migrationStatus: string }>>({});
  const [result, setResult] = useState<ResultState>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const previousNextSignal = useRef(nextSignal);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [artistsRes, productsRes] = await Promise.all([
        fetch("/api/admin/migration/matches/artists", { cache: "no-store" }),
        fetch("/api/admin/migration/matches/products", { cache: "no-store" }),
      ]);

      const [artistsJson, productsJson] = await Promise.all([artistsRes.json().catch(() => null), productsRes.json().catch(() => null)]);

      if (!artistsRes.ok) throw new Error(artistsJson?.error || "Failed to load artist matches");
      if (!productsRes.ok) throw new Error(productsJson?.error || "Failed to load product matches");

      const nextArtists = Array.isArray(artistsJson?.artists) ? artistsJson.artists : [];
      const nextProducts = Array.isArray(productsJson?.products) ? productsJson.products : [];
      const nextUserOptions = Array.isArray(artistsJson?.userOptions) ? artistsJson.userOptions : [];
      const nextArtistOptions = Array.isArray(productsJson?.artistOptions) ? productsJson.artistOptions : [];

      setArtists(nextArtists);
      setProducts(nextProducts);
      setUserOptions(nextUserOptions);
      setArtistOptions(nextArtistOptions);
      setArtistSelections(
        Object.fromEntries(
          nextArtists.map((item: ImportedArtistRow) => [
            item.artistKey,
            {
              linkedUserId: item.linkedUserId || item.suggestions[0]?.id || "",
              linkStatus: item.linkStatus || (item.suggestions.length ? "suggested" : "unlinked"),
            },
          ]),
        ),
      );
      setProductSelections(
        Object.fromEntries(
          nextProducts.map((item: ImportedProductRow) => [
            item.productKey,
            {
              artistKey: item.artistKey || item.suggestions[0]?.artistKey || "",
              migrationStatus: item.migrationStatus || (item.suggestions.length ? "suggested" : "unassigned"),
            },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load migration queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const classifiedArtists = useMemo(() => artists.map(classifyArtist), [artists]);
  const classifiedProducts = useMemo(() => products.map(classifyProduct), [products]);

  const queue = useMemo(() => {
    return mode === "accounts"
      ? classifiedArtists.filter((item) => item.queueBucket === bucket)
      : classifiedProducts.filter((item) => item.queueBucket === bucket);
  }, [bucket, classifiedArtists, classifiedProducts, mode]);

  useEffect(() => {
    setCurrentIndex((current) => (queue.length === 0 ? 0 : Math.min(current, queue.length - 1)));
  }, [queue.length, mode, bucket]);

  useEffect(() => {
    if (previousNextSignal.current === nextSignal) return;
    previousNextSignal.current = nextSignal;
    if (!queue.length) return;
    setCurrentIndex((current) => (current + 1) % queue.length);
  }, [nextSignal, queue.length]);

  const currentItem = queue[currentIndex] || null;

  async function confirmArtist(item: ClassifiedArtist) {
    const selection = artistSelections[item.artistKey];
    if (!selection) return;
    const selectedUser = userOptions.find((option) => option.id === selection.linkedUserId) || item.suggestions[0] || null;
    const summaryText = selectedUser
      ? `Es wird der bestehende Account ${selectedUser.label} mit diesem Künstler verknüpft.`
      : `Dieser Künstler bleibt vorerst im Review-Status.`;
    if (!window.confirm(`${summaryText}\n\nBestätigen?`)) return;

    setSavingKey(`artist:${item.artistKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/matches/artists/${encodeURIComponent(item.artistKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to link account");
      const message = selectedUser
        ? `${item.displayName || item.artistKey} wurde mit ${selectedUser.label} verknüpft.`
        : `Status für ${item.displayName || item.artistKey} gespeichert.`;
      setResult({ tone: "success", message });
      onResult?.(message);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to link account";
      setError(message);
      setResult({ tone: "error", message });
    } finally {
      setSavingKey(null);
    }
  }

  async function createArtistAccount(item: ClassifiedArtist) {
    if (!window.confirm("Es wird ein neuer User erstellt und mit diesem Künstler verknüpft. Das Startpasswort ist der normalisierte Artist-Slug und muss beim ersten Login geändert werden.\n\nBestätigen?")) {
      return;
    }

    setSavingKey(`create:${item.artistKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/accounts/${encodeURIComponent(item.artistKey)}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to create account");
      const message = json?.bootstrap?.initialPassword
        ? `Neuer Account erstellt. Initialpasswort: ${json.bootstrap.initialPassword}. Unsicheres Übergangskonstrukt; Passwortwechsel ist erzwungen.`
        : "Neuer Account erstellt und verknüpft.";
      setResult({ tone: "success", message });
      onResult?.(message);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create account";
      setError(message);
      setResult({ tone: "error", message });
    } finally {
      setSavingKey(null);
    }
  }

  async function confirmProduct(item: ClassifiedProduct) {
    const selection = productSelections[item.productKey];
    if (!selection) return;
    const selectedArtist = artistOptions.find((option) => option.artistKey === selection.artistKey) || item.suggestions[0] || null;
    const summaryText = selectedArtist
      ? `Dieses Kunstwerk wird ${selectedArtist.label} zugeordnet und ist danach in seiner Artist App sichtbar.`
      : `Dieses Kunstwerk bleibt vorerst im Review-Status.`;
    if (!window.confirm(`${summaryText}\n\nBestätigen?`)) return;

    setSavingKey(`product:${item.productKey}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/migration/matches/products/${encodeURIComponent(item.productKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to assign artwork");
      const message = selectedArtist
        ? `${item.title || item.productKey} wurde ${selectedArtist.label} zugeordnet.`
        : `Status für ${item.title || item.productKey} gespeichert.`;
      setResult({ tone: "success", message });
      onResult?.(message);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to assign artwork";
      setError(message);
      setResult({ tone: "error", message });
    } finally {
      setSavingKey(null);
    }
  }

  const queueTitle =
    mode === "accounts"
      ? bucket === "open"
        ? "Offene Account-Fälle"
        : bucket === "completed"
          ? "Erledigte Account-Fälle"
          : "Fehlerhafte Account-Fälle"
      : bucket === "open"
        ? "Offene Artwork-Fälle"
        : bucket === "completed"
          ? "Erledigte Artwork-Fälle"
          : "Fehlerhafte Artwork-Fälle";

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {result ? <div className={`rounded-xl px-4 py-3 text-sm ${toneClass(result.tone)}`}>{result.message}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{queueTitle}</div>
            <h3 className="text-lg font-semibold text-slate-900">
              {queue.length ? `Fall ${currentIndex + 1} von ${queue.length}` : "Keine Fälle in dieser Ansicht"}
            </h3>
            <p className="text-sm text-slate-600">
              {mode === "accounts"
                ? "Hier entscheidest du nur den nächsten sinnvollen Account-Schritt."
                : "Hier ordnest du immer nur ein Kunstwerk gleichzeitig zu."}
            </p>
          </div>
          {queue.length > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrentIndex((current) => (current - 1 + queue.length) % queue.length)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((current) => (current + 1) % queue.length)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
              >
                Weiter
              </button>
            </div>
          ) : null}
        </div>

        {loading ? <div className="mt-6 text-sm text-slate-500">Lade Queue…</div> : null}
        {!loading && !currentItem ? (
          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
            In diesem Bereich gibt es aktuell keine Einträge.
          </div>
        ) : null}

        {!loading && currentItem && mode === "accounts" ? (() => {
          const item = currentItem as ClassifiedArtist;
          const selection = artistSelections[item.artistKey] || { linkedUserId: "", linkStatus: item.linkStatus };
          const selectedUser = userOptions.find((option) => option.id === selection.linkedUserId) || item.suggestions[0] || null;
          return (
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xl font-semibold text-slate-900">{item.displayName || item.artistKey}</h4>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(item.linkStatus)}`}>{item.linkStatus}</span>
                </div>
                <div className="text-sm text-slate-500">
                  {[item.publicSlug ? `/${item.publicSlug}` : "", item.email, item.artistKey].filter(Boolean).join(" · ")}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Was passiert hier?</div>
                <div className="mt-2 text-sm text-slate-700">{item.queueReason}</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-slate-400">Vorgeschlagener Account</div>
                {selectedUser ? (
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <div className="font-medium text-slate-900">{selectedUser.label}</div>
                    <div className="text-sm text-slate-500">{[selectedUser.email, selectedUser.artistKey].filter(Boolean).join(" · ")}</div>
                    {"reasons" in selectedUser && Array.isArray(selectedUser.reasons) ? (
                      <div className="mt-1 text-xs text-slate-500">Warum vorgeschlagen: {selectedUser.reasons.join(" · ")}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Noch kein bestehender Account ausgewählt.</div>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Mit bestehendem Account verknüpfen</span>
                <select
                  value={selection.linkedUserId}
                  onChange={(event) =>
                    setArtistSelections((current) => ({
                      ...current,
                      [item.artistKey]: {
                        linkedUserId: event.target.value,
                        linkStatus: event.target.value ? "linked" : "needs_review",
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Kein bestehender Account gewählt</option>
                  {userOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} {option.email ? `· ${option.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void confirmArtist(item)}
                  disabled={savingKey === `artist:${item.artistKey}` || !selection.linkedUserId}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingKey === `artist:${item.artistKey}` ? "Speichert…" : "Bestätigen"}
                </button>
                <button
                  type="button"
                  onClick={() => void createArtistAccount(item)}
                  disabled={savingKey === `create:${item.artistKey}` || !item.email || Boolean(item.linkedUserId)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {savingKey === `create:${item.artistKey}` ? "Erstellt…" : "Account erstellen"}
                </button>
              </div>

              <div className="text-xs text-slate-500">
                {selection.linkedUserId
                  ? "Es wird der ausgewählte bestehende Account mit diesem Künstler verknüpft."
                  : "Es wird ein neuer User erstellt und mit diesem Künstler verknüpft."}
              </div>
            </div>
          );
        })() : null}

        {!loading && currentItem && mode === "artworks" ? (() => {
          const item = currentItem as ClassifiedProduct;
          const selection = productSelections[item.productKey] || { artistKey: item.artistKey, migrationStatus: item.migrationStatus };
          const selectedArtist = artistOptions.find((option) => option.artistKey === selection.artistKey) || item.suggestions[0] || null;
          return (
            <div className="mt-6 space-y-5">
              <div className="flex items-start gap-4">
                {item.thumbUrl ? (
                  <div className="h-24 w-24 overflow-hidden rounded-xl bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbUrl} alt={item.title} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xl font-semibold text-slate-900">{item.title || item.productKey}</h4>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeTone(item.migrationStatus)}`}>{item.migrationStatus}</span>
                  </div>
                  <div className="text-sm text-slate-500">
                    {[item.vendor, item.handle, item.productKey].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Was passiert hier?</div>
                <div className="mt-2 text-sm text-slate-700">{item.queueReason}</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-slate-400">Vorgeschlagener Artist</div>
                {selectedArtist ? (
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <div className="font-medium text-slate-900">{selectedArtist.label}</div>
                    <div className="text-sm text-slate-500">{[selectedArtist.publicSlug, selectedArtist.artistKey].filter(Boolean).join(" · ")}</div>
                    {"reasons" in selectedArtist && Array.isArray(selectedArtist.reasons) ? (
                      <div className="mt-1 text-xs text-slate-500">Warum vorgeschlagen: {selectedArtist.reasons.join(" · ")}</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Noch kein Artist ausgewählt.</div>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Artist auswählen</span>
                <select
                  value={selection.artistKey}
                  onChange={(event) =>
                    setProductSelections((current) => ({
                      ...current,
                      [item.productKey]: {
                        artistKey: event.target.value,
                        migrationStatus: event.target.value ? "assigned" : "needs_review",
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Kein Artist gewählt</option>
                  {artistOptions.map((option) => (
                    <option key={option.artistKey} value={option.artistKey}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void confirmProduct(item)}
                  disabled={savingKey === `product:${item.productKey}` || !selection.artistKey}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingKey === `product:${item.productKey}` ? "Speichert…" : "Bestätigen"}
                </button>
              </div>

              <div className="text-xs text-slate-500">
                Dieses Kunstwerk wird diesem Künstler zugeordnet und ist danach in seiner Artist App sichtbar.
              </div>
            </div>
          );
        })() : null}
      </div>
    </section>
  );
}
