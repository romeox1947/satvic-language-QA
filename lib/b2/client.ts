import { S3Client } from '@aws-sdk/client-s3';

let client: S3Client | null = null;

export function getB2Config() {
  const endpoint = process.env.B2_S3_ENDPOINT?.trim().replace(/\/$/, '');
  const bucket = process.env.B2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.B2_APPLICATION_KEY_ID?.trim();
  const secretAccessKey = process.env.B2_APPLICATION_KEY?.trim();
  const region = endpoint ? new URL(endpoint).hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/)?.[1] : null;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Backblaze B2 is not configured. Set B2_S3_ENDPOINT, B2_BUCKET_NAME, B2_APPLICATION_KEY_ID, and B2_APPLICATION_KEY using the values from your B2 bucket and application key.');
  }
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

export function getB2Client() {
  if (client) return client;
  const config = getB2Config();
  client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return client;
}
