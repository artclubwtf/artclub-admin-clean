import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

export async function uploadToS3(key: string, body: Buffer, contentType: string, filename?: string) {
  const cfg = resolveConfig();
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const url = cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/${key}` : undefined;
  return {
    key,
    url,
    sizeBytes: body.length,
    mimeType: contentType,
    filename,
  };
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
