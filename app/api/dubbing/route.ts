import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 1800;

const SARVAM = 'https://api.sarvam.ai/dubbing';
const LANGUAGES: Record<string, string> = {
  English: 'en-IN', Hindi: 'hi-IN', Tamil: 'ta-IN', Telugu: 'te-IN', Gujarati: 'gu-IN',
  Kannada: 'kn-IN', Bengali: 'bn-IN', Marathi: 'mr-IN', Punjabi: 'pa-IN', Malayalam: 'ml-IN',
  Odia: 'od-IN', Assamese: 'as-IN', Urdu: 'ur-IN', Sanskrit: 'sa-IN', Nepali: 'ne-IN',
};
const TARGET_LANGUAGES = new Set(['English', 'Hindi', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Marathi', 'Odia', 'Punjabi', 'Tamil', 'Telugu', 'Assamese']);

type Json = Record<string, any>;
const message = (value: Json) => {
  const candidate = value?.message ?? value?.detail ?? value?.error?.message ?? value?.error ?? value;
  return typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
};

export async function POST(request: Request) {
  try {
    const key = process.env.SARVAM_API_KEY?.trim();
    if (!key) return NextResponse.json({ error: 'Add SARVAM_API_KEY to .env.local to generate a dubbed video.' }, { status: 503 });
    if (!process.env.GEMINI_API_KEY?.trim()) return NextResponse.json({ error: 'Add GEMINI_API_KEY to .env.local before starting paid dubbing. The generated video is automatically sent to Gemini for QA.' }, { status: 503 });
    const form = await request.formData();
    const original = form.get('original');
    const sourceLanguage = String(form.get('sourceLanguage') || '');
    const targetLanguage = String(form.get('targetLanguage') || '');
    const projectName = String(form.get('projectName') || 'Dubbing QA');
    if (!(original instanceof File) || !original.size) return NextResponse.json({ error: 'Choose an original video or audio file.' }, { status: 400 });
    if (original.size > 450 * 1024 * 1024) return NextResponse.json({ error: 'The source file must be smaller than 450 MB for this local workflow.' }, { status: 413 });
    if (!LANGUAGES[sourceLanguage] || !LANGUAGES[targetLanguage] || !TARGET_LANGUAGES.has(targetLanguage) || sourceLanguage === targetLanguage) return NextResponse.json({ error: 'Choose a supported source language and one of Sarvam Dubbing’s 12 target languages. Source and target must differ.' }, { status: 400 });
    const targetCode = targetLanguage === 'Odia' ? 'or-IN' : LANGUAGES[targetLanguage];
    const extension = original.name.split('.').pop()?.toLowerCase() || '';
    const allowed = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'flv', 'wmv', 'wav', 'mp3', 'm4a'];
    if (!allowed.includes(extension)) return NextResponse.json({ error: 'Sarvam dubbing accepts MP4, MOV, MKV, WebM, AVI, FLV, WMV, WAV, MP3, or M4A files.' }, { status: 400 });

    const createdResponse = await fetch(`${SARVAM}/jobs`, {
      method: 'POST', headers: { 'api-subscription-key': key, 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ src_lang: LANGUAGES[sourceLanguage], target_langs: [targetCode], export_options: ['video'], voice_cloning: true, num_speakers: 1, register: 'modern-colloquial', job_name: projectName.slice(0, 120) || original.name, editor_flow: false }),
    });
    const created = await createdResponse.json().catch(() => ({}));
    if (!createdResponse.ok) throw new Error(`Sarvam could not create the dubbing job (${createdResponse.status}): ${message(created)}`);
    const jobId = created.data?.job_id;
    const uploadUrl = created.data?.upload_url;
    if (!jobId || !uploadUrl) throw new Error('Sarvam did not return the dubbing job and upload URL.');

    const uploaded = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(await original.arrayBuffer()), headers: { 'content-type': original.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' }, signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!uploaded.ok) throw new Error(`Uploading the source to Sarvam failed (${uploaded.status}).`);
    const started = await fetch(`${SARVAM}/jobs/${encodeURIComponent(jobId)}/start`, { method: 'POST', headers: { 'api-subscription-key': key }, cache: 'no-store' });
    const startedBody = await started.json().catch(() => ({}));
    if (!started.ok) throw new Error(`Sarvam could not start dubbing (${started.status}): ${message(startedBody)}`);
    return NextResponse.json({ jobId, status: 'queued', message: 'Source uploaded to Sarvam and dubbing has started.' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unexpected error while starting Sarvam dubbing.';
    console.error(`[api/dubbing] ${detail}`);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
