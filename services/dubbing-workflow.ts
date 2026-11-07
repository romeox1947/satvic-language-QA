import { get, put } from '@vercel/blob';
import { sleep } from 'workflow';

type JobInput = {
  originalBlobUrl: string;
  originalName: string;
  sourceLanguage: string;
  targetLanguage: string;
  projectName: string;
};

type Json = Record<string, any>;
const SARVAM = 'https://api.sarvam.ai/dubbing';
const lang: Record<string, string> = {
  English: 'en-IN', Hindi: 'hi-IN', Tamil: 'ta-IN', Telugu: 'te-IN', Gujarati: 'gu-IN',
  Kannada: 'kn-IN', Bengali: 'bn-IN', Marathi: 'mr-IN', Punjabi: 'pa-IN', Malayalam: 'ml-IN',
  Odia: 'or-IN', Assamese: 'as-IN',
};

async function startSarvam(input: JobInput) {
  'use step';
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new Error('SARVAM_API_KEY is not configured in Vercel.');
  const blob = await get(input.originalBlobUrl, { access: 'private' });
  if (!blob) throw new Error('The uploaded source video could not be found in Blob storage.');
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  const createdResponse = await fetch(`${SARVAM}/jobs`, {
    method: 'POST', headers: { 'api-subscription-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ src_lang: lang[input.sourceLanguage], target_langs: [lang[input.targetLanguage]], export_options: ['video'], voice_cloning: true, num_speakers: 1, register: 'modern-colloquial', job_name: input.projectName.slice(0, 120) || input.originalName, editor_flow: false }),
  });
  const created = await createdResponse.json().catch(() => ({}));
  if (!createdResponse.ok) throw new Error(`Sarvam could not create the dubbing job (${createdResponse.status}): ${created.message || created.detail || 'Unknown error'}`);
  const jobId = created.data?.job_id;
  const uploadUrl = created.data?.upload_url;
  if (!jobId || !uploadUrl) throw new Error('Sarvam did not return a dubbing job and upload URL.');
  const upload = await fetch(uploadUrl, { method: 'PUT', body: bytes, headers: { 'content-type': blob.blob.contentType || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' }, signal: AbortSignal.timeout(240_000) });
  if (!upload.ok) throw new Error(`Uploading the original to Sarvam failed (${upload.status}).`);
  const started = await fetch(`${SARVAM}/jobs/${encodeURIComponent(jobId)}/start`, { method: 'POST', headers: { 'api-subscription-key': key } });
  const startedBody = await started.json().catch(() => ({}));
  if (!started.ok) throw new Error(`Sarvam could not start dubbing (${started.status}): ${startedBody.message || startedBody.detail || 'Unknown error'}`);
  return { jobId };
}

async function checkSarvam(jobId: string) {
  'use step';
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new Error('SARVAM_API_KEY is not configured in Vercel.');
  const headers = { 'api-subscription-key': key };
  const response = await fetch(`${SARVAM}/jobs/${encodeURIComponent(jobId)}/live-status`, { headers, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Sarvam status returned ${response.status}: ${body.message || body.detail || 'Unknown error'}`);
  const live = body.data || {};
  if (live.status === 'failed') throw new Error(live.error_message || 'Sarvam dubbing failed.');
  if (!['completed', 'partial_failure'].includes(live.status)) return { ready: false, progress: Number(live.progress) || 0, step: live.current_step_label || 'Sarvam is creating the dub' };
  const exportResponse = await fetch(`${SARVAM}/jobs/${encodeURIComponent(jobId)}/export-status?limit=100`, { headers, cache: 'no-store' });
  const exportBody = await exportResponse.json().catch(() => ({}));
  if (!exportResponse.ok) throw new Error(`Sarvam export status returned ${exportResponse.status}.`);
  const exports = exportBody.data?.exports || [];
  const video = exports.find((item: Json) => item.export_type === 'video' && item.status === 'completed' && !item.is_stale);
  const failed = exports.find((item: Json) => item.export_type === 'video' && item.status === 'failed');
  if (failed) throw new Error(failed.error_message || 'Sarvam could not render the dubbed video.');
  return video?.download_url ? { ready: true, downloadUrl: video.download_url, progress: 100, step: 'Dub is ready; starting QA' } : { ready: false, progress: 90, step: 'Sarvam is rendering the dubbed video export' };
}

async function saveDub(downloadUrl: string) {
  'use step';
  const response = await fetch(downloadUrl, { cache: 'no-store', signal: AbortSignal.timeout(240_000) });
  if (!response.ok || !response.body) throw new Error(`Downloading the Sarvam dub failed (${response.status}).`);
  const blob = await put(`satvic-jobs/${crypto.randomUUID()}-dub.mp4`, response.body, { access: 'private', contentType: 'video/mp4', addRandomSuffix: true, multipart: true });
  return blob.url;
}

async function runQa(input: JobInput, dubbedBlobUrl: string) {
  'use step';
  const appUrl = process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!appUrl) throw new Error('APP_BASE_URL is missing. Set it to your deployed Vercel URL so the workflow can start QA.');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const response = await fetch(`${appUrl}/api/analyze`, {
    method: 'POST', headers,
    body: JSON.stringify({ originalBlobUrl: input.originalBlobUrl, dubbedBlobUrl, originalName: input.originalName, projectName: input.projectName, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage }),
    signal: AbortSignal.timeout(295_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `QA API returned ${response.status}.`);
  const report = { ...body, generatedBySarvam: true, originalVideoUrl: input.originalBlobUrl, dubbedVideoUrl: dubbedBlobUrl };
  const storedReport = await put(`satvic-jobs/${crypto.randomUUID()}-qa-report.json`, JSON.stringify(report), { access: 'private', contentType: 'application/json', addRandomSuffix: true });
  return { reportBlobUrl: storedReport.url };
}

export async function generateAndReview(input: JobInput) {
  'use workflow';
  try {
    const { jobId } = await startSarvam(input);
    const deadline = Date.now() + 12 * 60 * 60 * 1000;
    let current = { ready: false, progress: 0, step: 'Sarvam is creating the dub' } as Awaited<ReturnType<typeof checkSarvam>>;
    while (Date.now() < deadline) {
      await sleep('30s');
      current = await checkSarvam(jobId);
      if (current.ready && current.downloadUrl) break;
    }
    if (!current.ready || !current.downloadUrl) throw new Error('Sarvam has not finished the dubbing export within 12 hours.');
    const dubbedBlobUrl = await saveDub(current.downloadUrl);
    return await runQa(input, dubbedBlobUrl);
  } catch (error) {
    return { jobError: error instanceof Error ? error.message : 'The background job failed for an unknown reason.' };
  }
}
