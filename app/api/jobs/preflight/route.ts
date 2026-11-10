import { del, list } from '@vercel/blob';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PREFIX = 'satvic-jobs/';
const DEFAULT_LIMIT = 1024 * 1024 * 1024;
const RESERVE = 50 * 1024 * 1024;
const MIN_CLEANUP_AGE_MS = 10 * 60 * 1000;
type BlobItem = { url: string; pathname: string; size: number; uploadedAt: Date };

async function inspectStorage() {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.from('qa_jobs').select('original_blob_url,dubbed_blob_url,updated_at').in('status', ['queued', 'running']);
  if (error) throw new Error(`Could not verify active jobs before cleanup: ${error.message}`);
  const activeUrls = new Set<string>();
  for (const job of jobs || []) {
    if (new Date(job.updated_at).getTime() < Date.now() - 24 * 60 * 60 * 1000) continue;
    if (job.original_blob_url) activeUrls.add(job.original_blob_url);
    if (job.dubbed_blob_url) activeUrls.add(job.dubbed_blob_url);
  }
  const blobs: BlobItem[] = [];
  let cursor: string | undefined;
  let hasMore = true;
  while (hasMore) {
    const page = await list({ prefix: PREFIX, limit: 1000, cursor });
    blobs.push(...page.blobs.map(blob => ({ url: blob.url, pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt })));
    hasMore = page.hasMore;
    cursor = page.cursor;
  }
  return { blobs, activeUrls };
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is missing. Add it before starting a job.');
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  const controller = new AbortController();
  const timeoutMs = 30_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: controller.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply READY only.' }] }], generationConfig: { maxOutputTokens: 8 } }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini readiness check failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
    }
    return model;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini readiness check timed out after ${timeoutMs / 1000} seconds. No video was uploaded and no Sarvam job was started. Try again; if this keeps happening, check Gemini API availability and the configured model.`);
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before checking a job.' }, { status: 401 });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Connect a Vercel Blob store before starting a job.' }, { status: 503 });
    const body = await request.json();
    const mode = body.mode === 'existing' ? 'existing' : 'sarvam';
    const action = body.action === 'prepare' ? 'prepare' : 'inspect';
    const originalBytes = Number(body.originalBytes);
    const dubbedBytes = Number(body.dubbedBytes || 0);
    const durationSeconds = Number(body.durationSeconds || 0);
    if (!Number.isSafeInteger(originalBytes) || originalBytes <= 0 || (mode === 'existing' && (!Number.isSafeInteger(dubbedBytes) || dubbedBytes <= 0))) {
      return Response.json({ error: 'Select valid source and dub files first.' }, { status: 400 });
    }
    if (originalBytes > 450 * 1024 * 1024 || dubbedBytes > 450 * 1024 * 1024) return Response.json({ error: 'Each upload must be 450 MB or smaller for the current Blob upload configuration.' }, { status: 413 });
    const estimatedGeminiBytesPerSecond = mode === 'sarvam' ? 20_000 : 16_000;
    if (Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds * estimatedGeminiBytesPerSecond > 18 * 1024 * 1024) {
      return Response.json({ error: 'This clip is likely too long for the current Gemini audio-review request limit. Split it into shorter clips (about 18–20 minutes or less) before starting, so Sarvam credits are not spent on a dub the QA stage cannot review.' }, { status: 413 });
    }
    if (!process.env.SARVAM_API_KEY?.trim()) return Response.json({ error: 'SARVAM_API_KEY is missing.' }, { status: 503 });
    if (mode === 'sarvam' && (!process.env.WORKFLOW_INTERNAL_TOKEN || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY))) {
      return Response.json({ error: 'Background job setup is incomplete. Check WORKFLOW_INTERNAL_TOKEN and SUPABASE_SECRET_KEY.' }, { status: 503 });
    }
    const geminiModel = action === 'inspect' ? await checkGemini() : (process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash');
    const requiredBytes = (mode === 'sarvam' ? originalBytes * 2 : originalBytes + dubbedBytes) + RESERVE;
    const configuredLimit = Number(process.env.BLOB_STORAGE_LIMIT_BYTES);
    const limitBytes = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_LIMIT;
    const { blobs, activeUrls } = await inspectStorage();
    const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
    const freeBytes = Math.max(0, limitBytes - totalBytes);
    const isCleanupCandidate = (blob: BlobItem) => !activeUrls.has(blob.url)
      && !/qa-report.*\.json$/i.test(blob.pathname)
      && Date.now() - blob.uploadedAt.getTime() >= MIN_CLEANUP_AGE_MS;
    const reclaimable = blobs.filter(isCleanupCandidate).reduce((sum, blob) => sum + blob.size, 0);
    let cleanup: BlobItem[] = [];
    let cleanedBytes = 0;
    if (freeBytes < requiredBytes && action === 'prepare') {
      const eligible = blobs
        .filter(isCleanupCandidate)
        .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
      let projected = freeBytes;
      for (const blob of eligible) {
        cleanup.push(blob);
        projected += blob.size;
        if (projected >= requiredBytes) break;
      }
      if (cleanup.length) {
        for (let index = 0; index < cleanup.length; index += 100) await del(cleanup.slice(index, index + 100).map(blob => blob.url));
        cleanedBytes = cleanup.reduce((sum, blob) => sum + blob.size, 0);
      }
    }
    const remainingBytes = Math.max(0, freeBytes + cleanedBytes);
    if (remainingBytes < requiredBytes && (action === 'prepare' || freeBytes + reclaimable < requiredBytes)) {
      return Response.json({
        ok: false,
        error: `Not enough estimated Blob storage. Need about ${formatBytes(requiredBytes)} including a safety reserve, but only ${formatBytes(remainingBytes)} is available after eligible cleanup.`,
        storage: { usedBytes: Math.max(0, totalBytes - cleanedBytes), limitBytes, availableBytes: remainingBytes, requiredBytes, cleanedBytes },
        geminiModel,
      }, { status: 507, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({
      ok: true, action, mode, geminiModel, cleanupNeeded: action === 'inspect' && freeBytes < requiredBytes,
      storage: { usedBytes: Math.max(0, totalBytes - cleanedBytes), limitBytes, availableBytes: remainingBytes, requiredBytes, cleanedBytes },
      reclaimableBytes: action === 'inspect' ? reclaimable : undefined,
      cleanup: cleanedBytes ? `Deleted ${cleanup.length} inactive media file(s) (${formatBytes(cleanedBytes)}). QA report JSON and active jobs were kept.` : null,
      limitations: 'Storage is an estimate of objects in this project only. It cannot read Vercel monthly-average storage/transfer. Gemini check confirms the model responds now but does not reserve future quota or capacity. Sarvam wallet credits must be checked in Sarvam Billing.',
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preflight check failed.';
    console.error(`[api/jobs/preflight] ${message}`);
    return Response.json({ error: message }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
