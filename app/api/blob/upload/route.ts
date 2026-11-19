import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before uploading video files.' }, { status: 401 });
    if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
      return Response.json({ error: 'The Blob store is missing its server credentials. Check that the store is connected to the Production environment, then redeploy.' }, { status: 503 });
    }
    const body = (await request.json()) as HandleUploadPresignedBody;
    const json = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname) => {
        if (!pathname.startsWith(`satvic-users/${user.id}/satvic-jobs/`)) throw new Error('Uploads must be stored in your account workspace.');
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
