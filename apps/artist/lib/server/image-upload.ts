import sharp from "sharp";

export const imageUploadVariants = [
  "avatar",
  "profile-cover",
  "event-cover",
  "post",
  "collection",
  "message",
  "artwork",
  "gallery",
] as const;

export type ImageUploadVariant = (typeof imageUploadVariants)[number];

const supportedInputFormats = new Set(["jpeg", "png", "webp", "heif"]);
const standardMaxBytes = 15 * 1024 * 1024;
const artworkMaxBytes = 30 * 1024 * 1024;

export class ImageUploadError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function imageUploadMaxBytes(variant: ImageUploadVariant) {
  return variant === "artwork" ? artworkMaxBytes : standardMaxBytes;
}

export function parseImageUploadVariant(value: FormDataEntryValue | null): ImageUploadVariant {
  return typeof value === "string" && imageUploadVariants.includes(value as ImageUploadVariant)
    ? (value as ImageUploadVariant)
    : "post";
}

export async function processImageUpload(buffer: Buffer, variant: ImageUploadVariant) {
  let source: sharp.Sharp;
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    source = sharp(buffer, { failOn: "error", limitInputPixels: 100_000_000 }).rotate();
    const metadata = await source.metadata();
    if (!metadata.format || !supportedInputFormats.has(metadata.format) || !metadata.width || !metadata.height) {
      throw new ImageUploadError("invalid_image_data");
    }
    sourceWidth = metadata.width;
    sourceHeight = metadata.height;
    if (metadata.width > 12_000 || metadata.height > 12_000) throw new ImageUploadError("image_dimensions_too_large");
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError("invalid_image_data");
  }

  if (variant === "artwork") {
    const metadata = await source.metadata();
    const resized = source.resize({ width: 8_000, height: 8_000, fit: "inside", withoutEnlargement: true });
    let pipeline: sharp.Sharp;
    let mimeType: string;
    let extension: string;
    if (metadata.format === "png") {
      pipeline = resized.png({ compressionLevel: 6, adaptiveFiltering: true });
      mimeType = "image/png";
      extension = "png";
    } else if (metadata.format === "webp") {
      pipeline = resized.webp({ quality: 95, smartSubsample: true });
      mimeType = "image/webp";
      extension = "webp";
    } else {
      pipeline = resized.jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true });
      mimeType = "image/jpeg";
      extension = "jpg";
    }
    const result = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: result.data, width: result.info.width, height: result.info.height, mimeType, extension };
  }

  const dimensions =
    variant === "avatar"
      ? { width: 256, height: 256, fit: "cover" as const }
      : variant === "profile-cover"
        ? { width: 1_800, height: 1_013, fit: "cover" as const }
        : variant === "event-cover"
          ? (() => { const width = Math.max(1, Math.min(1_800, Math.floor(sourceWidth), Math.floor(sourceHeight * .8))); return { width, height: Math.round(width * 1.25), fit: "cover" as const }; })()
          : variant === "post"
            ? { width: 1_600, height: 2_000, fit: "inside" as const }
            : { width: 960, height: 1_200, fit: "inside" as const };
  const result = await source
    .resize({ ...dimensions, position: "centre", withoutEnlargement: true })
    .webp({ quality: variant === "post" || variant === "event-cover" ? 88 : 84, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  const blur = await sharp(result.data).resize({ width: 24, height: 24, fit: "inside" }).webp({ quality: 40 }).toBuffer();
  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    mimeType: "image/webp",
    extension: "webp",
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
  };
}
