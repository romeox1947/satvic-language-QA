import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: 'Connect a Vercel Blob store to this Vercel project before uploading videos.' }, { status: 503 });
  }
  try {
    const body = (await request.json()) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => ({
        pathname,
        access: 'private',
        addRandomSuffix: true,
        maximumSizeInBytes: 450 * 1024 * 1024,
        allowedContentTypes: ['video/*', 'audio/*', 'application/octet-stream'],
        validUntil: Date.now() + 15 * 60 * 1000,
      }),
    });
    return Response.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not authorize the video upload.';
    return Response.json({ error: message }, { status: 400 });
  }
}
