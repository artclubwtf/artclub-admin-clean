"use client";

import { useRef, useState } from "react";

export type ImageUploadVariant =
  | "avatar"
  | "profile-cover"
  | "event-cover"
  | "post"
  | "collection"
  | "message"
  | "artwork"
  | "gallery";

export type ImageUploadItem = {
  url: string;
  previewUrl?: string;
  type?: "image" | "video";
  filename?: string;
  width?: number;
  height?: number;
  storageKey?: string;
  provider?: "s3";
  mimeType?: string;
  sizeBytes?: number | null;
  originalUrl?: string;
  originalStorageKey?: string;
};

type ImageUploadProps<T extends ImageUploadItem> = {
  label: string;
  hint?: string;
  variant: ImageUploadVariant;
  items: T[];
  onChange: (items: T[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  multiple?: boolean;
  maxItems?: number;
  disabled?: boolean;
  endpoint?: string;
  resolveUpload?: (payload: any) => T | Promise<T>;
};

const errors: Record<string, string> = {
  file_required: "Choose a non-empty image file.",
  file_too_large: "This image is too large. The limit is 15 MB (30 MB for artwork).",
  invalid_file_type: "Use a JPEG, PNG, WebP or HEIC image.",
  invalid_image_data: "This file is not a readable image.",
  image_dimensions_too_large: "This image exceeds the maximum dimensions of 12,000 × 12,000 pixels.",
  rate_limited: "Too many uploads. Wait a minute and try again.",
  upload_unavailable: "The upload service is temporarily unavailable.",
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function uploadRequest(endpoint: string, file: File, variant: ImageUploadVariant, onProgress: (value: number) => void) {
  return new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      const payload = request.response || {};
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else reject(new Error(payload?.error?.code || payload?.error || `request_failed_${request.status}`));
    };
    request.onerror = () => reject(new Error("network_error"));
    const form = new FormData();
    form.append("file", file);
    form.append("variant", variant);
    request.send(form);
  });
}

export function ImageUpload<T extends ImageUploadItem>({
  label,
  hint,
  variant,
  items,
  onChange,
  onUploadingChange,
  multiple = false,
  maxItems = multiple ? 10 : 1,
  disabled = false,
  endpoint = "/api/network/upload",
  resolveUpload = ((payload: any) => payload.media as T),
}: ImageUploadProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const previewClass = variant === "avatar" ? "aspect-square rounded-full" : variant === "event-cover" ? "aspect-[4/5] rounded-2xl" : variant === "profile-cover" ? "aspect-[16/9] rounded-2xl" : "aspect-[4/3] rounded-2xl";

  async function upload(files: File[]) {
    if (uploading || disabled || !files.length) return;
    const available = Math.max(0, maxItems - (multiple ? items.length : 0));
    const selected = files.slice(0, multiple ? available : 1);
    if (!selected.length) {
      setError(`You can upload up to ${maxItems} image${maxItems === 1 ? "" : "s"}.`);
      return;
    }
    const maxBytes = variant === "artwork" ? 30 * 1024 * 1024 : 15 * 1024 * 1024;
    const invalid = selected.find(file => !file.size || file.size > maxBytes || !allowedTypes.has(file.type.toLowerCase()));
    if (invalid) {
      setError(!invalid.size ? errors.file_required : invalid.size > maxBytes ? errors.file_too_large : errors.invalid_file_type);
      setRetryFiles([]);
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    setError("");
    setProgress(0);
    try {
      const uploaded: T[] = [];
      for (let index = 0; index < selected.length; index += 1) {
        const payload = await uploadRequest(endpoint, selected[index], variant, (fileProgress) => {
          setProgress(Math.round(((index + fileProgress / 100) / selected.length) * 100));
        });
        uploaded.push(await resolveUpload(payload));
      }
      onChange(multiple ? [...items, ...uploaded] : uploaded.slice(-1));
      setRetryFiles([]);
      setProgress(100);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "upload_failed";
      setError(errors[code] || (code === "network_error" ? "The network connection was interrupted. Try again." : "The image could not be uploaded."));
      setRetryFiles(selected);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function remove(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="meta-text mt-1">{hint}</p> : null}
      </div>
      {items.length ? (
        <div className={multiple ? "grid gap-3 sm:grid-cols-2" : variant === "avatar" ? "max-w-40" : "max-w-2xl"}>
          {items.map((item, index) => (
            <div key={`${item.url}-${index}`} className="space-y-2">
              <div className={`overflow-hidden bg-[var(--surface-soft)] ${previewClass}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl || item.url} alt={item.filename || `${label} preview`} className="h-full w-full object-cover" />
              </div>
              <button type="button" disabled={disabled || uploading} onClick={() => remove(index)} className="text-action text-sm disabled:opacity-40">
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}
        className={`rounded-2xl bg-[var(--surface-soft)] p-4 transition ${dragging ? "ring-2 ring-[var(--accent)]" : ""}`}
      >
        <div className="flex min-h-12 flex-wrap items-center gap-3">
          <button type="button" disabled={disabled || uploading} onClick={() => inputRef.current?.click()} className="secondary-action disabled:opacity-40">
            {items.length && !multiple ? "Replace" : multiple ? "Upload images" : `Upload ${label.toLowerCase()}`}
          </button>
          <button type="button" disabled={disabled || uploading} onClick={() => cameraRef.current?.click()} className="text-action min-h-11 px-2 text-sm disabled:opacity-40">
            Take photo
          </button>
          <span className="meta-text hidden sm:inline">or drop {multiple ? "images" : "an image"} here</span>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={multiple} className="hidden" onChange={(event) => void upload(Array.from(event.target.files || []))} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void upload(Array.from(event.target.files || []))} />
        {uploading ? (
          <div className="mt-3" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--divider)]"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }} /></div>
            <p className="meta-text mt-2">Uploading… {progress}%</p>
          </div>
        ) : null}
      </div>
      {error ? <div className="flex flex-wrap items-center gap-3" role="alert"><p className="text-sm text-[var(--danger)]">{error}</p>{retryFiles.length ? <button type="button" className="text-action text-sm" onClick={() => void upload(retryFiles)}>Retry</button> : null}</div> : null}
    </div>
  );
}
