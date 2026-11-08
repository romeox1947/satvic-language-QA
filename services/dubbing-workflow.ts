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

function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  const domain = configured || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '';
  if (!domain) return '';
  return (domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`).replace(/\/+$/, '');
}

function errorText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === 'object') {
    const item = value as Json;
    const candidate = item.message ?? item.error?.message ?? item.error ?? item.detail ?? item;
    if (typeof candidate === 'string') return candidate;
    try { return JSON.stringify(candidate); } catch { /* use fallback below */ }
  }
  return 'The background job failed for an unknown reason.';
}

async function readResponse(response: Response): Promise<{ body: Json | null; text: string }> {
  const text = await response.text();
  try {
    const parsed: unknown = JSON.parse(text);
    return { body: parsed && typeof parsed === 'object' ? parsed as Json : null, text };
  } catch {
    return { body: null, text };
  }
}

async function sendJobEmail(input: JobInput, outcome: 'started' | 'completed' | 'failed', detail: string) {
  'use step';
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = process.env.NOTIFICATION_EMAIL?.trim() || 'piyushkumaryadav2027@gmail.com';
  if (!apiKey || !from) {
    console.warn('[dubbing-workflow] Email notification skipped: configure RESEND_API_KEY and RESEND_FROM_EMAIL.');
    return { sent: false };
  }

  const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => htmlEntities[char]);
  const title = outcome === 'started' ? 'Dubbing job started' : outcome === 'completed' ? 'Dubbing and QA completed' : 'Dubbing or QA failed';
  const appUrl = appBaseUrl();
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Satvic Studio] ${title}: ${input.projectName}`,
        text: `${title}\nProject: ${input.projectName}\nLanguages: ${input.sourceLanguage} → ${input.targetLanguage}\n\n${detail}${appUrl ? `\n\nOpen Satvic Studio: ${appUrl}` : ''}`,
        html: `<h2>${title}</h2><p><strong>Project:</strong> ${escapeHtml(input.projectName)}</p><p><strong>Languages:</strong> ${escapeHtml(input.sourceLanguage)} &rarr; ${escapeHtml(input.targetLanguage)}</p><p>${escapeHtml(detail)}</p>${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open Satvic Studio</a></p>` : ''}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`[dubbing-workflow] Email notification failed (${response.status}): ${body.slice(0, 500)}`);
      return { sent: false };
    }
    const result = await response.json().catch(() => ({}));
    console.info(`[dubbing-workflow] Email notification accepted by Resend: ${result.id || 'message ID unavailable'}`);
    return { sent: true };
  } catch (error) {
    console.warn(`[dubbing-workflow] Email notification could not be sent: ${errorText(error)}`);
    return { sent: false };
  }
}

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
  const appUrl = appBaseUrl();
  if (!appUrl) throw new Error('APP_BASE_URL is missing. Set it to your deployed Vercel URL so the workflow can start QA.');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  let response: Response;
  try {
    response = await fetch(`${appUrl}/api/analyze`, {
      method: 'POST', headers,
      body: JSON.stringify({ originalBlobUrl: input.originalBlobUrl, dubbedBlobUrl, originalName: input.originalName, projectName: input.projectName, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage }),
      signal: AbortSignal.timeout(295_000),
    });
  } catch (error) {
    const detail = errorText(error);
    const timedOut = /timeout|timed out|abort/i.test(detail);
    return { jobError: timedOut
      ? 'QA request timed out after about 5 minutes. Vercel Hobby limits this QA function to 300 seconds; try a shorter video or split the video into shorter clips.'
      : `Could not reach the QA API at ${appUrl}/api/analyze: ${detail}` };
  }
  const { body, text } = await readResponse(response);
  if (!response.ok) {
    const detail = body ? errorText(body.error ?? body.message ?? body.detail ?? body) : text.trim().slice(0, 1200);
    const message = detail || response.statusText || 'No response details were returned.';
    // The API has already completed and returned an error. Retrying it would rerun
    // transcription and AI review, potentially repeating substantial provider work.
    return { jobError: `QA failed (HTTP ${response.status}): ${message}` };
  }
  if (!body) {
    return { jobError: `QA returned HTTP ${response.status}, but the response was not JSON (${response.headers.get('content-type') || 'unknown content type'}): ${text.trim().slice(0, 1200) || 'empty response'}` };
  }
  const report = { ...body, generatedBySarvam: true, originalVideoUrl: input.originalBlobUrl, dubbedVideoUrl: dubbedBlobUrl };
  const storedReport = await put(`satvic-jobs/${crypto.randomUUID()}-qa-report.json`, JSON.stringify(report), { access: 'private', contentType: 'application/json', addRandomSuffix: true });
  return { reportBlobUrl: storedReport.url };
}

export async function generateAndReview(input: JobInput) {
  'use workflow';
  try {
    const { jobId } = await startSarvam(input);
    const hostedOnVercel = Boolean(process.env.VERCEL);
    await sendJobEmail(input, 'started', hostedOnVercel
      ? 'Your video has been accepted and the dubbing and QA workflow is running on Vercel. You can close your browser or turn off your computer; we will email you again when it completes or fails.'
      : 'Your video has been accepted and the dubbing and QA workflow has started locally. Keep this computer and the local development server running until the job finishes.');
    const deadline = Date.now() + 12 * 60 * 60 * 1000;
    let current = { ready: false, progress: 0, step: 'Sarvam is creating the dub' } as Awaited<ReturnType<typeof checkSarvam>>;
    while (Date.now() < deadline) {
      await sleep('30s');
      current = await checkSarvam(jobId);
      if (current.ready && current.downloadUrl) break;
    }
    if (!current.ready || !current.downloadUrl) throw new Error('Sarvam has not finished the dubbing export within 12 hours.');
    const dubbedBlobUrl = await saveDub(current.downloadUrl);
    const result = await runQa(input, dubbedBlobUrl);
    if ('jobError' in result && typeof result.jobError === 'string') {
      await sendJobEmail(input, 'failed', result.jobError);
      return result;
    }
    await sendJobEmail(input, 'completed', 'The dubbed video and QA report are ready in Satvic Studio.');
    return result;
  } catch (error) {
    const jobError = errorText(error);
    await sendJobEmail(input, 'failed', jobError);
    return { jobError };
  }
}
