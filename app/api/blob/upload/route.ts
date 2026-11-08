import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
      return Response.json({ error: 'The Blob store is missing its server credentials. Check that the store is connected to the Production environment, then redeploy.' }, { status: 503 });
    }
    const body = (await request.json()) as HandleUploadPresignedBody;
    const json = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          validUntil,
          maximumSizeInBytes: 450 * 1024 * 1024,
          allowedContentTypes: ['video/*', 'audio/*', 'application/octet-stream'],
        });
        return { token, urlOptions: { validUntil, addRandomSuffix: true, maximumSizeInBytes: 450 * 1024 * 1024, allowedContentTypes: ['video/*', 'audio/*', 'application/octet-stream'] } };
      },
    });
    return Response.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not authorize the video upload.';
    console.error(`[api/blob/upload] ${message}`);
    return Response.json({ error: message }, { status: 400 });
  }
}
