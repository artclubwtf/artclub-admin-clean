import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

type UploadBody = Buffer | Uint8Array | Readable | ReadableStream;

export async function uploadToS3(
  key: string,
  body: UploadBody,
  contentType: string,
  filename?: string,
  contentLength?: number,
) {
  const cfg = resolveConfig();
  const s3 = getClient();

  const nodeBody = body instanceof Readable ? body : body instanceof ReadableStream ? Readable.fromWeb(body) : body;
  const size =
    typeof (nodeBody as any)?.length === "number" ? (nodeBody as any).length : typeof contentLength === "number" ? contentLength : undefined;

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

export async function createPresignedPutUrl(key: string, contentType: string, expiresInSeconds = 15 * 60) {
  const cfg = resolveConfig();
  const s3 = getClient();
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return { uploadUrl, expiresIn: expiresInSeconds };
}

export async function downloadFromS3(key: string) {
  const cfg = resolveConfig();
  const s3 = getClient();
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
  );
  const body = await streamToBuffer(res.Body);

  return {
    key,
    body,
    contentType: res.ContentType || undefined,
    contentLength: res.ContentLength || body.length,
    lastModified: res.LastModified,
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
