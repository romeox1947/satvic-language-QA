import { list } from '@vercel/blob';

type RecoverSavedDubInput = {
  userId: string;
  jobId: string;
  originalBlobUrl: string | null;
  updatedAt?: string | null;
};

/** Recover a private dub URL for old jobs whose workflow result was not saved. */
export async function recoverSavedDubForJob({ userId, jobId, originalBlobUrl, updatedAt }: RecoverSavedDubInput) {
  const prefix = `satvic-users/${userId}/satvic-jobs/`;
  const exactJobPrefix = `${prefix}${jobId}-dub`;
  const candidates: Array<{ url: string; pathname: string; uploadedAt: Date }> = [];
  let sourceUploadedAt: Date | null = null;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      if (originalBlobUrl && blob.url === originalBlobUrl) sourceUploadedAt = blob.uploadedAt;
      if (!/-dub(?:-[^/]+)?\.mp4$/i.test(blob.pathname)) continue;
      candidates.push({ url: blob.url, pathname: blob.pathname, uploadedAt: blob.uploadedAt });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const exact = candidates.filter(blob => blob.pathname.startsWith(exactJobPrefix));
  if (exact.length === 1) return exact[0].url;
  if (exact.length > 1) return null;
  if (!sourceUploadedAt) return null;

  const failureTime = updatedAt ? Date.parse(updatedAt) : Date.now();
  const sourceTime = sourceUploadedAt.getTime();
  const nearFailure = candidates.filter(blob => {
    const time = blob.uploadedAt.getTime();
    return time >= sourceTime && time <= failureTime + 60_000;
  });
  return nearFailure.length === 1 ? nearFailure[0].url : null;
}
