import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

type S3Config = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
};

let client: S3Client | null = null;
let cachedConfig: S3Config | null = null;

function resolveConfig(): S3Config {
  if (cachedConfig) return cachedConfig;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing S3 configuration (S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET)");
  }
  cachedConfig = {
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, ""),
  };
  return cachedConfig;
}

export function getPublicS3Url(key: string) {
  const base = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!base) return undefined;
  return `${base}/${key}`;
}

export function tryExtractS3KeyFromUrl(raw: string | null | undefined) {
  if (!raw) return undefined;

  const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (publicBase && raw.startsWith(`${publicBase}/`)) {
    return decodeURIComponent(raw.slice(publicBase.length + 1));
  }

  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const looksLikeObjectStorage =
      hostname.includes("amazonaws.com") || hostname.includes("digitaloceanspaces.com") || hostname.includes("cloudfront.net");
    if (!looksLikeObjectStorage) return undefined;

    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!path) return undefined;

    const bucket = process.env.S3_BUCKET?.trim();
    if (bucket && path.startsWith(`${bucket}/`)) {
      return path.slice(bucket.length + 1);
    }

    return path;
  } catch {
    return undefined;
  }
}

function getClient() {
  if (!client) {
    const cfg = resolveConfig();
    client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return client;
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

type UploadBody = Buffer | Uint8Array | Readable;

export async function uploadToS3(
  key: string,
  body: UploadBody,
  contentType: string,
  filename?: string,
  contentLength?: number,
) {
  const cfg = resolveConfig();
  const s3 = getClient();

  const nodeBody = body instanceof Readable ? body : body;
  const size =
    typeof (nodeBody as { length?: number })?.length === "number"
      ? (nodeBody as { length: number }).length
      : typeof contentLength === "number"
        ? contentLength
        : undefined;

  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: nodeBody as any,
      ContentType: contentType,
      ContentLength: size,
    }),
  );
  const url = cfg.publicBaseUrl
    ? `${cfg.publicBaseUrl}/${key}`
    : await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
        }),
        { expiresIn: 60 * 60 },
      ).catch(() => undefined);
  return {
    key,
    url,
    sizeBytes: size,
    mimeType: contentType,
    filename,
  };
}

export async function getS3ObjectUrl(key: string, expiresInSeconds = 60 * 60) {
  const cfg = resolveConfig();
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl}/${key}`;
  const s3 = getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function downloadFromS3(key: string) {
  const cfg = resolveConfig();
  const s3 = getClient();
  const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  const body = await streamToBuffer(res.Body);
  return {
    key,
    body,
    contentType: res.ContentType || undefined,
    contentLength: res.ContentLength || body.length,
    lastModified: res.LastModified,
  };
}

export async function createMultipartUpload(key: string, contentType: string) {
  const cfg = resolveConfig();
  const s3 = getClient();
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("Failed to create multipart upload");
  return { uploadId: res.UploadId, bucket: cfg.bucket, key };
}

export async function getMultipartPartUrl(key: string, uploadId: string, partNumber: number, expiresInSeconds = 15 * 60) {
  const cfg = resolveConfig();
  const s3 = getClient();
  const command = new UploadPartCommand({ Bucket: cfg.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return { url, expiresIn: expiresInSeconds };
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
  const cfg = resolveConfig();
  const s3 = getClient();
  const res = await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: cfg.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  );
  return {
    location: res.Location,
    bucket: res.Bucket,
    key: res.Key,
    etag: res.ETag,
  };
}
