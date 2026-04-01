"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { StatusMessage } from "@/components/forms/StatusMessage";
import type { ArtistMediaItem } from "@/lib/types";

type ImageUploaderProps = {
  label: string;
  hint?: string;
  kind: ArtistMediaItem["kind"];
  items: ArtistMediaItem[];
  onChange: (items: ArtistMediaItem[]) => void;
  multiple?: boolean;
};

export function ImageUploader({ label, hint, kind, items, onChange, multiple = false }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch("/api/artist/media/upload", {
      method: "POST",
      body: formData,
    });
    const uploadJson = (await uploadRes.json().catch(() => null)) as
      | {
          ok?: boolean;
          error?: string;
          file?: { s3Key?: string; filename: string; mimeType: string; sizeBytes: number; url: string; previewUrl: string };
        }
      | null;
    if (!uploadRes.ok || !uploadJson?.file) {
      throw new Error(uploadJson?.error || "Upload failed");
    }

    const mediaRes = await fetch("/api/artist/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        s3Key: uploadJson.file.s3Key,
        filename: uploadJson.file.filename,
        mimeType: uploadJson.file.mimeType,
        sizeBytes: uploadJson.file.sizeBytes,
        url: uploadJson.file.url,
        previewUrl: uploadJson.file.previewUrl,
      }),
    });
    const mediaJson = (await mediaRes.json().catch(() => null)) as { ok?: boolean; error?: string; media?: ArtistMediaItem } | null;
    if (!mediaRes.ok || !mediaJson?.media) {
      throw new Error(mediaJson?.error || "Failed to save media");
    }

    return mediaJson.media;
  }

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setUploading(true);
    setError(null);
    try {
      const uploaded: ArtistMediaItem[] = [];
      for (const file of files) {
        uploaded.push(await uploadFile(file));
      }
      onChange(multiple ? [...items, ...uploaded] : uploaded.slice(-1));
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeItem(index: number) {
    const next = [...items];
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-medium tracking-[-0.01em] text-neutral-700">{label}</div>
        {hint ? <div className="text-sm leading-6 text-neutral-500">{hint}</div> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" tone="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading..." : multiple ? "Upload images" : "Upload image"}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <div key={`${item.id || item.url}-${index}`} className="space-y-3 rounded-[1.75rem] bg-neutral-50 p-3">
              <div className="aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl || item.url} alt={item.filename || "Upload"} className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs text-neutral-500">{item.filename || "Image"}</div>
                <Button type="button" tone="ghost" className="px-0 py-0 text-xs" onClick={() => removeItem(index)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
