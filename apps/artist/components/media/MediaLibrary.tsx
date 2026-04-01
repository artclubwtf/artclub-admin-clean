"use client";

import { useMemo, useRef, useState } from "react";

import { StatusMessage } from "@/components/forms/StatusMessage";
import { Button } from "@/components/primitives/Button";
import { PageTitle } from "@/components/primitives/PageTitle";
import { Section } from "@/components/primitives/Section";
import type { ArtistMediaItem } from "@/lib/types";

type MediaLibraryProps = {
  initialMedia: ArtistMediaItem[];
};

const mediaKinds: Array<{ kind: ArtistMediaItem["kind"]; label: string }> = [
  { kind: "avatar", label: "Avatar" },
  { kind: "hero", label: "Header" },
  { kind: "gallery", label: "Gallery" },
  { kind: "artwork", label: "Artwork" },
];

export function MediaLibrary({ initialMedia }: MediaLibraryProps) {
  const [media, setMedia] = useState(initialMedia);
  const [kind, setKind] = useState<ArtistMediaItem["kind"]>("gallery");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const grouped = useMemo(
    () =>
      mediaKinds.map((item) => ({
        ...item,
        items: media.filter((entry) => entry.kind === item.kind),
      })),
    [media],
  );

  async function handleUpload(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setUploading(true);
    setStatus(null);

    try {
      const created: ArtistMediaItem[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/artist/media/upload", { method: "POST", body: formData });
        const uploadJson = (await uploadRes.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              file?: { filename: string; mimeType: string; sizeBytes: number; url: string; previewUrl: string };
            }
          | null;
        if (!uploadRes.ok || !uploadJson?.file) throw new Error(uploadJson?.error || "Upload failed");

        const mediaRes = await fetch("/api/artist/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            filename: uploadJson.file.filename,
            mimeType: uploadJson.file.mimeType,
            sizeBytes: uploadJson.file.sizeBytes,
            url: uploadJson.file.url,
            previewUrl: uploadJson.file.previewUrl,
          }),
        });
        const mediaJson = (await mediaRes.json().catch(() => null)) as { ok?: boolean; error?: string; media?: ArtistMediaItem } | null;
        if (!mediaRes.ok || !mediaJson?.media) throw new Error(mediaJson?.error || "Failed to save media");
        created.push(mediaJson.media);
      }

      setMedia((current) => [...created, ...current]);
      setStatus({ tone: "success", text: "Upload completed." });
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      setStatus({ tone: "error", text: err?.message || "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setStatus(null);
    const res = await fetch(`/api/artist/media/${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !json?.ok) {
      setStatus({ tone: "error", text: json?.error || "Delete failed." });
      return;
    }

    setMedia((current) => current.filter((item) => item.id !== id));
    setStatus({ tone: "success", text: "Media removed." });
  }

  return (
    <div className="space-y-8">
      <PageTitle
        title="Media"
        subtitle="ArtistMediaV2 stores your uploaded files. Use these assets for onboarding, profile visuals and artworks."
      />

      <Section title="Upload" subtitle="Choose the asset type before uploading.">
        <div className="space-y-4 rounded-[1.75rem] bg-neutral-50 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {mediaKinds.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={`rounded-full px-4 py-2 text-sm ${kind === item.kind ? "bg-neutral-950 text-white" : "bg-white text-neutral-600"}`}
                onClick={() => setKind(item.kind)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button type="button" tone="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading..." : `Upload ${kind}`}
          </Button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleUpload(event.target.files)} />
        </div>
        {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}
      </Section>

      {grouped.map((group) => (
        <Section key={group.kind} title={group.label} subtitle={`${group.items.length} item${group.items.length === 1 ? "" : "s"}`}>
          {group.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <div key={item.id} className="space-y-3 rounded-[1.75rem] bg-neutral-50 p-3">
                  <div className="aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl || item.url} alt={item.filename || group.label} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-neutral-500">{item.filename || group.label}</div>
                    <Button type="button" tone="ghost" className="px-0 py-0 text-xs" onClick={() => void handleDelete(item.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.75rem] bg-neutral-50 px-4 py-4 text-sm text-neutral-500">No {group.label.toLowerCase()} uploads yet.</div>
          )}
        </Section>
      ))}
    </div>
  );
}
