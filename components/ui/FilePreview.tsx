export function FilePreview({
  mimeType,
  url,
  filename,
  height = 140,
  className,
}: {
  mimeType?: string;
  url?: string | null;
  filename?: string;
  height?: number;
  className?: string;
}) {
  const isImage = (mimeType || "").startsWith("image/");
  const isPdf = (mimeType || "").toLowerCase().includes("pdf");

  return (
    <div className={["ui-file-preview", className].filter(Boolean).join(" ")} style={{ height }}>
      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={filename || "file"} className="ui-file-preview-img" />
      ) : isPdf ? (
        <div className="ui-file-preview-fallback">PDF · {filename}</div>
      ) : (
        <div className="ui-file-preview-fallback">{filename || "File"}</div>
      )}
    </div>
  );
}
