import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getClient() {
  if (!client) {
    const region = mustEnv("S3_REGION");
    const accessKeyId = mustEnv("S3_ACCESS_KEY_ID");
    const secretAccessKey = mustEnv("S3_SECRET_ACCESS_KEY");

    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

// Beispiel Upload (falls du sowas hast):
export async function uploadToS3(params: {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
}) {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
}
