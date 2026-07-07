"use client";

import { ImageUpload, type ImageUploadVariant } from "@/components/forms/ImageUpload";
import { requestJson } from "@/lib/client/request";
import type { ArtistMediaItem } from "@/lib/types";

type ImageUploaderProps = {
  label: string;
  hint?: string;
  kind: ArtistMediaItem["kind"];
  items: ArtistMediaItem[];
  onChange: (items: ArtistMediaItem[]) => void;
  multiple?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
};

const variants: Record<ArtistMediaItem["kind"], ImageUploadVariant> = {
  avatar: "avatar",
  hero: "profile-cover",
  gallery: "gallery",
  artwork: "artwork",
  other: "post",
};

export function ImageUploader({ label, hint, kind, items, onChange, multiple = false, onUploadingChange }: ImageUploaderProps) {
  async function persistUpload(payload: any) {
    if (!payload?.file) throw new Error("upload_failed");
    const { response, json } = await requestJson<{ ok?: boolean; error?: string; media?: ArtistMediaItem }>("/api/artist/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        s3Key: payload.file.s3Key,
        filename: payload.file.filename,
        mimeType: payload.file.mimeType,
        sizeBytes: payload.file.sizeBytes,
        url: payload.file.url,
        previewUrl: payload.file.previewUrl,
      }),
      retries: 2,
    });
    if (!response.ok || !json?.media) throw new Error(json?.error || "upload_failed");
    return json.media;
  }

  return <ImageUpload label={label} hint={hint} variant={variants[kind]} items={items} onChange={onChange} multiple={multiple} endpoint="/api/artist/media/upload" resolveUpload={persistUpload} onUploadingChange={onUploadingChange} />;
}
