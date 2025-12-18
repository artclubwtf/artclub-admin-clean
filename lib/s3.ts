import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const region = process.env.S3_REGION;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const bucket = process.env.S3_BUCKET;

if (!region || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error("Missing S3 configuration (S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET)");
}

let client: S3Client | null = null;

function getClient() {
  if (!client) {
    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export async function uploadToS3(key: string, body: Buffer, contentType: string) {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { bucket, key };
}
