import { del, list } from '@vercel/blob';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RETENTION_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Vercel Blob is not configured.' }, { status: 503 });

  try {
    const admin = createAdminClient();
    const { data: activeJobs, error: activeJobsError } = await admin
      .from('qa_jobs')
      .select('original_blob_url,dubbed_blob_url,updated_at')
      .in('status', ['queued', 'running']);
    if (activeJobsError) throw new Error(`Could not check active QA jobs: ${activeJobsError.message}`);

    const activeMedia = new Set<string>();
    for (const job of activeJobs || []) {
      // A crashed worker can leave a stale running row. The app's longest configured
      // workflow is under 24h, so an older heartbeat should not retain blobs forever.
      if (new Date(job.updated_at).getTime() < Date.now() - RETENTION_MS) continue;
      if (job.original_blob_url) activeMedia.add(job.original_blob_url);
      if (job.dubbed_blob_url) activeMedia.add(job.dubbed_blob_url);
    }

    const cutoff = Date.now() - RETENTION_MS;
    const expiredUrls: string[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const page = await list({ prefix: 'satvic-jobs/', limit: 1000, cursor });
      for (const blob of page.blobs) {
        // Reports are small and remain available in job history after video cleanup.
        if (/qa-report.*\.json$/i.test(blob.pathname)) continue;
        if (activeMedia.has(blob.url)) continue;
        if (new Date(blob.uploadedAt).getTime() < cutoff) expiredUrls.push(blob.url);
      }
      hasMore = page.hasMore;
      cursor = page.cursor;
    }

    for (let index = 0; index < expiredUrls.length; index += BATCH_SIZE) {
      await del(expiredUrls.slice(index, index + BATCH_SIZE));
    }

    return Response.json({
      deletedMediaFiles: expiredUrls.length,
      retainedActiveMediaFiles: activeMedia.size,
      reportsRetained: true,
      retentionHours: 24,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blob cleanup failed.';
    console.error(`[blob-cleanup] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
