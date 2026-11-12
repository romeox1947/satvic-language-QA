import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { get as getBlob } from '@vercel/blob';
import { updateAnalysisProgress } from './progress-store';
import { put } from '@vercel/blob';
import { createClient } from '../../../lib/supabase/server';
import { sendGmailJobEmail } from '../../../lib/email/gmail';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SARVAM = 'https://api.sarvam.ai';
const LANGUAGES: Record<string, { whisper: string; sarvam: string }> = {
  English: { whisper: 'en', sarvam: 'en-IN' }, Hindi: { whisper: 'hi', sarvam: 'hi-IN' },
  Tamil: { whisper: 'ta', sarvam: 'ta-IN' }, Telugu: { whisper: 'te', sarvam: 'te-IN' },
  Gujarati: { whisper: 'gu', sarvam: 'gu-IN' }, Kannada: { whisper: 'kn', sarvam: 'kn-IN' },
  Bengali: { whisper: 'bn', sarvam: 'bn-IN' }, Marathi: { whisper: 'mr', sarvam: 'mr-IN' },
  Punjabi: { whisper: 'pa', sarvam: 'pa-IN' }, Malayalam: { whisper: 'ml', sarvam: 'ml-IN' },
  Odia: { whisper: 'or', sarvam: 'od-IN' }, Assamese: { whisper: 'as', sarvam: 'as-IN' },
  Urdu: { whisper: 'ur', sarvam: 'ur-IN' }, Sanskrit: { whisper: 'sa', sarvam: 'sa-IN' },
  Nepali: { whisper: 'ne', sarvam: 'ne-IN' },
};

type Segment = { start: number; end: number; text: string; words?: { start: number; end: number; text: string }[] };
type Transcript = { transcript: string; segments: Segment[]; detectedLanguage: string; engine: string };
type AudioFinding = { severity: 'critical' | 'review' | 'info'; title: string; detail: string; category?: string; sourceStart?: number; sourceEnd?: number; dubStart?: number; dubEnd?: number; sourceStartSegment?: number; sourceEndSegment?: number; dubStartSegment?: number; dubEndSegment?: number; evidenceStatus?: 'cross-checked' | 'audio-only' | 'transcript-only'; sourceQuote?: string; dubQuote?: string };
type Json = Record<string, any>;
const transcriptFindingsSchema = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['critical', 'review', 'info'] }, category: { type: 'string' },
    title: { type: 'string' }, detail: { type: 'string' }, sourceQuote: { type: 'string' }, dubQuote: { type: 'string' },
  }, required: ['severity', 'category', 'title', 'detail', 'sourceQuote', 'dubQuote'] } } },
  required: ['findings'],
};
const audioFindingsSchema = {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['critical', 'review', 'info'] }, category: { type: 'string' },
    title: { type: 'string' }, detail: { type: 'string' }, sourceQuote: { type: 'string' }, dubQuote: { type: 'string' },
    sourceStart: { type: ['number', 'null'] }, sourceEnd: { type: ['number', 'null'] },
    dubStart: { type: ['number', 'null'] }, dubEnd: { type: ['number', 'null'] },
    sourceStartSegment: { type: ['integer', 'null'] }, sourceEndSegment: { type: ['integer', 'null'] },
    dubStartSegment: { type: ['integer', 'null'] }, dubEndSegment: { type: ['integer', 'null'] },
  }, required: ['severity', 'category', 'title', 'detail', 'sourceQuote', 'dubQuote', 'sourceStart', 'sourceEnd', 'dubStart', 'dubEnd', 'sourceStartSegment', 'sourceEndSegment', 'dubStartSegment', 'dubEndSegment'] } } },
  required: ['findings'],
};

function sarvamSegments(data: Json): Segment[] {
  const timestamps = data.timestamps;
  if (timestamps && typeof timestamps === 'object') {
    const labels: unknown[] = Array.isArray(timestamps.chunks) ? timestamps.chunks
      : Array.isArray(timestamps.words) ? timestamps.words
        : Array.isArray(timestamps.segments) ? timestamps.segments : [];
    const starts: unknown[] = timestamps.start_time_seconds || timestamps.startTimeSeconds || timestamps.starts || [];
    const ends: unknown[] = timestamps.end_time_seconds || timestamps.endTimeSeconds || timestamps.ends || [];
    const parsed = labels.map((entry, index) => {
      const item = entry && typeof entry === 'object' ? entry as Json : {};
      const text = typeof entry === 'string' ? entry : String(item.text ?? item.transcript ?? item.word ?? '');
      const start = Number(item.start ?? item.start_time_seconds ?? starts[index]);
      const end = Number(item.end ?? item.end_time_seconds ?? ends[index]);
      return { start, end, text: text.trim() };
    }).filter(segment => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end >= segment.start);
    if (parsed.length) return parsed;
  }
  const segments = Array.isArray(data.segments) ? data.segments : data.diarized_transcript?.entries;
  if (!Array.isArray(segments)) return [];
  return segments.map((item: Json) => ({
    start: Number(item.start ?? item.start_time_seconds),
    end: Number(item.end ?? item.end_time_seconds),
    text: String(item.text ?? item.transcript ?? '').trim(),
  })).filter((segment: Segment) => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end >= segment.start);
}

function providerError(value: Json): string {
  const candidate = value?.message ?? value?.detail ?? value?.error?.message ?? value?.error ?? value;
  if (typeof candidate === 'string') return candidate;
  try { return JSON.stringify(candidate); } catch { return 'Unrecognized provider error response.'; }
}

function interactionOutputText(payload: Json): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  return payload.steps?.flatMap((step: Json) => step.content || [])
    .filter((item: Json) => item.type === 'text')
    .map((item: Json) => item.text || '')
    .join('') || '';
}

async function extractAudioForSarvam(file: File): Promise<File> {
  const extension = path.extname(file.name).toLowerCase();
  const isVideo = file.type.startsWith('video/') || ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'].includes(extension);
  if (!isVideo) return file;
  const ffmpegBinary = ffmpegPath;
  if (!ffmpegBinary) throw new Error('The bundled FFmpeg executable is unavailable. Reinstall project dependencies and try again.');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'satvic-dub-qa-'));
  const inputPath = path.join(directory, `input${extension || '.mp4'}`);
  const outputPath = path.join(directory, 'audio.mp3');
  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegBinary, [
        '-nostdin', '-y', '-i', inputPath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', '-f', 'mp3', outputPath,
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let diagnostic = '';
      child.stderr?.on('data', chunk => { diagnostic = `${diagnostic}${chunk}`.slice(-2500); });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(code === 1 && /Stream map .* matches no streams|matches no streams/i.test(diagnostic) ? 'This video has no audio track.' : `Could not extract video audio. ${diagnostic.trim().split('\n').slice(-3).join(' ')}`)));
    });
    const audio = await readFile(outputPath);
    if (!audio.length) throw new Error('Audio extraction created an empty file.');
    return new File([audio], `${path.basename(file.name, extension)}.mp3`, { type: 'audio/mpeg' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function extractCompactAudio(file: File): Promise<{ data: string; mime_type: string }> {
  const extension = path.extname(file.name).toLowerCase() || '.mp4';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'satvic-audio-review-'));
  const inputPath = path.join(directory, `input${extension}`);
  const outputPath = path.join(directory, 'review.mp3');
  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegPath!, ['-nostdin', '-y', '-i', inputPath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '24000', '-b:a', '48k', '-f', 'mp3', outputPath], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let diagnostic = '';
      child.stderr?.on('data', chunk => { diagnostic = `${diagnostic}${chunk}`.slice(-1800); });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(`Could not prepare audio for AI listening. ${diagnostic.trim().split('\n').slice(-2).join(' ')}`)));
    });
    const audio = await readFile(outputPath);
    return { data: audio.toString('base64'), mime_type: 'audio/mp3' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function transcribeWithSarvam(file: File, languageCode: string, key: string): Promise<Transcript> {
  const audioFile = await extractAudioForSarvam(file);
  const fileName = audioFile.name.replace(/[^\w.-]/g, '_').slice(-100) || 'media.mp3';
  const job = await sarvamJson('/speech-to-text/job/v1', key, { job_parameters: { model: 'saaras:v4', mode: 'transcribe', language_code: languageCode, with_timestamps: true } });
  if (!job.job_id) throw new Error('Sarvam did not return a transcription job ID.');
  const linkResponse = await sarvamJson('/speech-to-text/job/v1/upload-files', key, { job_id: job.job_id, files: [fileName] });
  const uploadUrl = linkResponse.upload_urls?.[fileName]?.file_url || linkResponse.upload_urls?.[fileName]?.url;
  if (!uploadUrl) throw new Error('Sarvam did not return a media upload URL.');
  const uploaded = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(await audioFile.arrayBuffer()), headers: { 'content-type': audioFile.type || 'audio/mpeg', 'x-ms-blob-type': 'BlockBlob' } });
  if (!uploaded.ok) throw new Error(`Sarvam media upload failed (${uploaded.status}).`);
  await sarvamJson(`/speech-to-text/job/v1/${encodeURIComponent(job.job_id)}/start`, key, {});
  const deadline = Date.now() + 25 * 60 * 1000;
  let status: Json = {};
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const response = await fetch(`${SARVAM}/speech-to-text/job/v1/${encodeURIComponent(job.job_id)}/status`, { headers: { 'api-subscription-key': key }, cache: 'no-store' });
    status = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Sarvam status check returned ${response.status}: ${providerError(status)}`);
    if (status.job_state === 'Completed' || status.job_state === 'PartiallyCompleted') break;
    if (status.job_state === 'Failed') throw new Error(providerError(status.error_message ?? status) || 'Sarvam transcription failed.');
  }
  if (!['Completed', 'PartiallyCompleted'].includes(status.job_state)) throw new Error('Sarvam transcription timed out. Try shorter media or check your Sarvam dashboard.');
  const outputNames = (status.job_details || []).flatMap((detail: Json) => detail.outputs || []).map((output: Json) => output.file_name).filter(Boolean);
  if (!outputNames.length) throw new Error('Sarvam completed without returning a transcript file.');
  const downloadInfo = await sarvamJson('/speech-to-text/job/v1/download-files', key, { job_id: job.job_id, files: outputNames });
  const resultUrl = downloadInfo.download_urls?.[outputNames[0]]?.file_url || downloadInfo.download_urls?.[outputNames[0]]?.url;
  if (!resultUrl) throw new Error('Sarvam did not return a transcript download link.');
  const resultResponse = await fetch(resultUrl, { cache: 'no-store' });
  if (!resultResponse.ok) throw new Error('Could not download the Sarvam transcript result.');
  const data = await resultResponse.json();
  const transcript = typeof data.transcript === 'string' ? data.transcript : '';
  if (!transcript.trim()) throw new Error('Sarvam returned an empty transcript. Check that the selected media has clear speech.');
  const segments = sarvamSegments(data);
  return { transcript, segments, detectedLanguage: data.language_code || languageCode, engine: 'Sarvam Saaras v4' };
}

async function transcribeWithWhisper(file: File, language: string, languageCode: string, key: string): Promise<Transcript> {
  const workerUrl = process.env.WHISPER_WORKER_URL || 'http://127.0.0.1:8001';
  const form = new FormData();
  form.set('file', file, file.name);
  form.set('language', language);
  let response: Response;
  try {
    response = await fetch(`${workerUrl}/transcribe`, { method: 'POST', body: form, signal: AbortSignal.timeout(25 * 60 * 1000) });
  } catch {
    return transcribeWithSarvam(file, languageCode, key);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Whisper returned ${response.status}: ${providerError(body)}`);
  return body as Transcript;
}

async function sarvamJson(path: string, key: string, body: Json): Promise<Json> {
  const response = await fetch(`${SARVAM}${path}`, {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Sarvam ${path} returned ${response.status}: ${providerError(result)}`);
  return result;
}

async function geminiRequest(body: Json, key: string, timeoutMs: number) {
  const primaryModel = String(body.model || process.env.GEMINI_MODEL || 'gemini-3.8-flash');
  const models = [...new Set([primaryModel, process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite'])];
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ ...body, model }), signal: AbortSignal.timeout(timeoutMs),
        });
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const pauseMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(10_000, retryAfter * 1000) : 1500 * (attempt + 1);
          await response.body?.cancel();
          await new Promise(resolve => setTimeout(resolve, pauseMs));
          continue;
        }
        if ([429, 500, 502, 503, 504].includes(response.status) && model !== models[models.length - 1]) {
          await response.body?.cancel();
          break;
        }
        const headers = new Headers(response.headers);
        headers.set('x-satvic-gemini-model', model);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      } catch (error) {
        lastError = error;
        const named = error as Error & { cause?: Error & { code?: string } };
        const cause = named.cause;
        const detail = [cause?.code, cause?.message || named.message].filter(Boolean).join(': ');
        if (named.name === 'TimeoutError' || attempt === 2) {
          throw new Error(`Could not reach Gemini model ${model} after ${attempt + 1} attempt(s): ${detail || 'network request failed'}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reach Gemini.');
}

function splitText(text: string, limit = 1800) {
  const sentences = text.match(/[^.!?।]+[.!?।]*/gu) || [text];
  const chunks: string[] = []; let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > limit && current) { chunks.push(current); current = ''; }
    for (let i = 0; i < sentence.length; i += limit) {
      const part = sentence.slice(i, i + limit);
      if (current && current.length + part.length > limit) { chunks.push(current); current = ''; }
      current += part;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

async function backTranslate(text: string, sourceCode: string, dubCode: string, key: string) {
  const output: string[] = [];
  for (const input of splitText(text)) {
    const result = await sarvamJson('/translate', key, { input, source_language_code: dubCode, target_language_code: sourceCode, model: 'sarvam-translate:v1' });
    if (typeof result.translated_text !== 'string') throw new Error('Sarvam Translate did not return translated text.');
    output.push(result.translated_text);
  }
  return output.join('\n');
}

function findings(source: string, backTranslation: string) {
  const result: AudioFinding[] = [];
  const negation = /\b(no|not|never|don't|do not|isn't|cannot|without|avoid|नहीं|मत|बिना|இல்லை|வேண்டாம்|కాదు|వద్దు|નહીં|નથી|ಬೇಡ|ಅಲ್ಲ|না|নয়)\b/giu;
  const sourceNegations = [...source.matchAll(negation)].length;
  const backNegations = [...backTranslation.matchAll(negation)].length;
  if (sourceNegations !== backNegations) result.push({ severity: 'critical', title: 'Possible negation change', category: 'Meaning', detail: `Negation cues found in source: ${sourceNegations} · in back-translation: ${backNegations}. Listen to the dubbed clip and verify manually.` });
  const ratio = backTranslation.trim().length / Math.max(source.trim().length, 1);
  if (ratio < 0.45) result.push({ severity: 'review', title: 'Possible omission or shortened content', category: 'Omission/addition', detail: 'The back-translation is much shorter than the source. This can indicate an omission, but translation style can also change length.' });
  if (ratio > 1.9) result.push({ severity: 'review', title: 'Possible extra or expanded content', category: 'Omission/addition', detail: 'The back-translation is much longer than the source. Check whether the dub adds an explanation or changes the meaning.' });
  return result;
}

function phrasesSupportSameFinding(audio: AudioFinding, text: AudioFinding) {
  if (audio.sourceStart !== undefined && text.sourceStart !== undefined && Math.abs(audio.sourceStart - text.sourceStart) > 30) return false;
  if (audio.dubStart !== undefined && text.dubStart !== undefined && Math.abs(audio.dubStart - text.dubStart) > 30) return false;
  const audioCategory = (audio.category || '').toLowerCase().split('/')[0];
  const textCategory = (text.category || '').toLowerCase().split('/')[0];
  if (audioCategory && textCategory && audioCategory !== textCategory && !(audioCategory.includes('number') && textCategory.includes('number'))) return false;
  const overlap = (left: string, right: string) => {
    const a = new Set(left.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
    const b = new Set(right.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
    if (!a.size || !b.size) return false;
    const common = [...a].filter(word => b.has(word)).length;
    return common >= 1 && common / Math.min(a.size, b.size) >= 0.5;
  };
  return overlap(audio.sourceQuote || '', text.sourceQuote || '') && overlap(audio.dubQuote || '', text.dubQuote || '');
}

function locatePhrase(segments: Segment[], phrase: string) {
  const words = phrase.toLocaleLowerCase().match(/[\p{L}\p{M}]{2,}/gu) || [];
  if (!words.length || !segments.length) return { start: undefined, end: undefined };
  let best = { score: 0, index: 0 };
  for (let index = 0; index < segments.length; index++) {
    const text = segments[index].text.toLocaleLowerCase();
    const hits = words.filter(word => text.includes(word)).length;
    const score = hits / words.length;
    if (score > best.score) best = { score, index };
  }
  return best.score >= 0.34 ? { start: segments[best.index].start, end: segments[best.index].end } : { start: undefined, end: undefined };
}
function formatSegments(segments: Segment[]) {
  return segments.map((segment, index) => `[${index}] ${segment.start.toFixed(1)}-${segment.end.toFixed(1)}s: ${segment.text}`).join('\n').slice(0, 14000);
}

function segmentRange(segments: Segment[], startIndex: unknown, endIndex: unknown, startTime: unknown, endTime: unknown) {
  if (!segments.length) return { start: typeof startTime === 'number' && Number.isFinite(startTime) ? Math.max(0, startTime) : undefined, end: typeof endTime === 'number' && Number.isFinite(endTime) ? Math.max(0, endTime) : undefined };
  const resolveIndex = (value: unknown, fallbackTime: unknown) => {
    if (Number.isInteger(value) && Number(value) >= 0 && Number(value) < segments.length) return Number(value);
    if (typeof fallbackTime === 'number' && Number.isFinite(fallbackTime)) return segments.reduce((best, segment, index) => Math.abs(segment.start - fallbackTime) < Math.abs(segments[best].start - fallbackTime) ? index : best, 0);
    return undefined;
  };
  const first = resolveIndex(startIndex, startTime);
  const last = resolveIndex(endIndex, endTime);
  if (first === undefined) return { start: undefined, end: undefined };
  const boundedEnd = Math.max(first, last ?? first);
  return { start: segments[first].start, end: segments[boundedEnd].end };
}
function timedTranscriptChunks(source: Transcript, dub: Transcript) {
  if (!source.segments.length || !dub.segments.length) return [];
  const duration = Math.max(
    ...source.segments.map(segment => segment.end),
    ...dub.segments.map(segment => segment.end),
  );
  // Keep review passages narrow enough to catch a single changed claim, while
  // bounding provider calls for longer videos.
  const windowSeconds = Math.max(30, Math.ceil(duration / 8));
  const chunks: { start: number; end: number; source: Segment[]; dub: Segment[] }[] = [];
  for (let start = 0; start < duration; start += windowSeconds) {
    const end = Math.min(duration, start + windowSeconds);
    const sourcePart = source.segments.filter(segment => segment.end > start && segment.start < end);
    const dubPart = dub.segments.filter(segment => segment.end > start && segment.start < end);
    if (sourcePart.length || dubPart.length) chunks.push({ start, end, source: sourcePart, dub: dubPart });
  }
  return chunks;
}

async function geminiTranscriptReview(source: Transcript, dub: Transcript, sourceLanguage: string, targetLanguage: string, modelsUsed: Set<string>): Promise<AudioFinding[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return [];
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  const timedChunks = timedTranscriptChunks(source, dub);
  const chunks = timedChunks.length
    ? timedChunks.map((chunk, index) => ({
      label: `time window ${Math.floor(chunk.start)}-${Math.ceil(chunk.end)} seconds (part ${index + 1} of ${timedChunks.length})`,
      source: formatSegments(chunk.source),
      dub: formatSegments(chunk.dub),
      sourceSegments: chunk.source,
      dubSegments: chunk.dub,
    }))
    : (() => {
      const count = Math.max(1, Math.ceil(Math.max(source.transcript.length, dub.transcript.length) / 3000));
      return Array.from({ length: count }, (_, index) => ({
        label: `passage ${index + 1} of ${count}`,
        source: source.transcript.slice(Math.floor(source.transcript.length * index / count), Math.floor(source.transcript.length * (index + 1) / count)),
        dub: dub.transcript.slice(Math.floor(dub.transcript.length * index / count), Math.floor(dub.transcript.length * (index + 1) / count)),
        sourceSegments: [] as Segment[],
        dubSegments: [] as Segment[],
      }));
    })();
  const findingsByKey = new Map<string, AudioFinding>();
  for (const chunk of chunks) {
    const prompt = `Compare these source and dubbed transcript segments for dubbing QA (${chunk.label}). Source language: ${sourceLanguage}. Dub language: ${targetLanguage}. These segments are matched by their media timestamps; compare only the speech shown here. Check every number and unit in its sentence, including whether a claim says below or above a limit. Flag only when the dub changes the source claim; do not judge health or nutrition safety without a trusted reference. Also flag clear English words or phrases left in the dub instead of the selected target language as Language mixing. Ignore names, brands, and common loanwords normally used in the target language. Natural rewording is correct. Report EVERY distinct issue in this passage; do not stop after the first issue or combine separate occurrences. Each finding must have short source and dub quotes. Do not invent a finding when meaning matches or the transcript is unclear. Do not infer pronunciation or accent from text. Return JSON only: {"findings":[{"severity":"critical|review|info","category":"Meaning|Omission/addition|Numbers/names|Language mixing|Other","title":"short issue","detail":"plain-English explanation of what the source says and what the dub says","sourceQuote":"short source phrase","dubQuote":"short target-language transcript phrase"}]}. Return an empty findings list if no concrete mismatch appears.\n\nSOURCE (${sourceLanguage}):\n${chunk.source}\n\nDUB (${targetLanguage}):\n${chunk.dub}`;
    const response = await geminiRequest({ model, input: prompt, response_format: { type: 'text', mime_type: 'application/json', schema: transcriptFindingsSchema }, generation_config: { max_output_tokens: 4096 } }, key, 5 * 60 * 1000);
    const usedModel = response.headers.get('x-satvic-gemini-model');
    if (usedModel) modelsUsed.add(usedModel);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini transcript cross-check returned ${response.status}: ${providerError(payload)}`);
    const output = interactionOutputText(payload);
    let parsed: Json;
    try {
      parsed = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new Error(`Gemini transcript cross-check returned incomplete or invalid JSON for ${chunk.label}.`);
    }
    if (!Array.isArray(parsed.findings)) throw new Error(`Gemini transcript cross-check returned invalid findings for ${chunk.label}.`);
    for (const item of parsed.findings.filter((entry: Json) => entry?.title && entry?.detail && entry?.sourceQuote?.trim() && entry?.dubQuote?.trim() && ['critical', 'review', 'info'].includes(entry.severity))) {
      const sourceQuote = String(item.sourceQuote || '').slice(0, 300);
      const dubQuote = String(item.dubQuote || '').slice(0, 300);
      const sourceRange = locatePhrase(chunk.sourceSegments.length ? chunk.sourceSegments : source.segments, sourceQuote);
      const dubRange = locatePhrase(chunk.dubSegments.length ? chunk.dubSegments : dub.segments, dubQuote);
      const finding: AudioFinding = { severity: item.severity, title: String(item.title).slice(0, 140), detail: String(item.detail).slice(0, 1000), category: String(item.category || 'Meaning'), sourceQuote, dubQuote, sourceStart: sourceRange.start, sourceEnd: sourceRange.end, dubStart: dubRange.start, dubEnd: dubRange.end, evidenceStatus: 'transcript-only' };
      findingsByKey.set(`${finding.title}|${sourceQuote}|${dubQuote}|${finding.sourceStart ?? ''}|${finding.dubStart ?? ''}`.toLowerCase(), finding);
    }
  }
  return [...findingsByKey.values()];
}
async function geminiAudioReview(source: Transcript, dub: Transcript, sourceAudio: { data: string; mime_type: string }, dubAudio: { data: string; mime_type: string }, sourceLanguage: string, targetLanguage: string, modelsUsed: Set<string>): Promise<AudioFinding[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return [] as AudioFinding[];
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  const body = {
    model,
    input: [
      { type: 'text', text: `You are an audio dubbing quality reviewer. You can listen to BOTH attached audio tracks. Track 1 is the original ${sourceLanguage}; track 2 is the finished dub in ${targetLanguage}. Compare the spoken meaning, not just the transcripts. The timestamped transcripts below help locate speech; audio is the evidence. Find EVERY distinct issue and each separate occurrence; do not stop after one or combine separate times. Check changed meaning, omissions/additions, each quantity and unit, and claims changed from below to above a limit. Flag clear English words or phrases used instead of the selected target language as Language mixing; ignore proper names, brands, and common loanwords. Do not judge health or nutrition safety without a trusted reference. Do not label a regional accent as wrong just because it differs; only flag if it affects intelligibility or brief requirements. For each issue give the exact start and end time in BOTH tracks where possible (seconds from each track's start), a category, severity (critical/review/info), a plain-English explanation that states what the source says and what the dub says, with short quotes. Return the zero-based start/end segment indexes for the closest transcript segments (sourceStartSegment, sourceEndSegment, dubStartSegment, dubEndSegment). Use transcript segments as timing anchors. Do not invent issues or exact quotes. If audio or transcripts are unclear, state the uncertainty instead of guessing. Output JSON only: {"findings":[{"severity":"critical|review|info","category":"Meaning|Omission/addition|Numbers/names|Language mixing|Pronunciation/intelligibility|Accent/voice|Pacing/timing|Audio quality|Other","title":"short actionable issue","detail":"what the source says and what the dub says","sourceQuote":"short source phrase","dubQuote":"short target-language phrase heard","sourceStart":0,"sourceEnd":1,"dubStart":0,"dubEnd":1,"sourceStartSegment":0,"sourceEndSegment":0,"dubStartSegment":0,"dubEndSegment":0}]}. If no concrete issue is audible, return {"findings":[]}.\n\nSOURCE TRANSCRIPT SEGMENTS (seconds):\n${formatSegments(source.segments)}\n\nDUB TRANSCRIPT SEGMENTS (seconds):\n${formatSegments(dub.segments)}\n\nFull source transcript: ${source.transcript.slice(0, 8000)}\n\nFull dub transcript: ${dub.transcript.slice(0, 8000)}` },
      { type: 'audio', data: sourceAudio.data, mime_type: sourceAudio.mime_type },
      { type: 'audio', data: dubAudio.data, mime_type: dubAudio.mime_type },
    ],
  };
  const requestBytes = Buffer.byteLength(JSON.stringify(body));
  if (requestBytes > 18 * 1024 * 1024) throw new Error('The two audio tracks are too long for one AI listening review. Use shorter clips (about 20 minutes or less) and analyze the video in parts.');
  const response = await geminiRequest({ ...body, response_format: { type: 'text', mime_type: 'application/json', schema: audioFindingsSchema }, generation_config: { max_output_tokens: 4096 } }, key, 10 * 60 * 1000);
  const usedModel = response.headers.get('x-satvic-gemini-model');
  if (usedModel) modelsUsed.add(usedModel);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini audio review returned ${response.status}: ${providerError(payload)}`);
  const output = interactionOutputText(payload);
  let parsed: Json;
  try {
    parsed = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } catch {
    throw new Error('Gemini audio review returned incomplete or invalid JSON.');
  }
  if (!Array.isArray(parsed.findings)) return [];
  return parsed.findings.filter((item: Json) => item?.title && item?.detail && ['critical', 'review', 'info'].includes(item.severity)).map((item: Json): AudioFinding => {
    const sourceRange = segmentRange(source.segments, item.sourceStartSegment, item.sourceEndSegment, item.sourceStart, item.sourceEnd);
    const dubRange = segmentRange(dub.segments, item.dubStartSegment, item.dubEndSegment, item.dubStart, item.dubEnd);
    return {
      severity: item.severity, title: String(item.title).slice(0, 140), detail: String(item.detail).slice(0, 1000),
      category: String(item.category || 'Other'), sourceQuote: String(item.sourceQuote || '').slice(0, 300), dubQuote: String(item.dubQuote || '').slice(0, 300), sourceStart: sourceRange.start, sourceEnd: sourceRange.end,
      dubStart: dubRange.start, dubEnd: dubRange.end, evidenceStatus: 'audio-only',
    };
  });
}
export async function POST(request: Request) {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'Add SARVAM_API_KEY to .env.local and restart the dev server.' }, { status: 503 });
  if (!process.env.GEMINI_API_KEY?.trim()) return NextResponse.json({ error: 'Add GEMINI_API_KEY to .env.local. The AI audio reviewer needs it to listen to and compare both languages.' }, { status: 503 });
  let stage = 'Reading uploaded files';
  let progressId = '';
  let historyJobId = '';
  let historyOriginalUrl = '';
  let historyDubbedUrl = '';
  let historyNotificationEmail = '';
  let historyProjectName = '';
  let historySourceLanguage = '';
  let historyTargetLanguage = '';
  let historySupabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    const isJson = request.headers.get('content-type')?.includes('application/json');
    const form = isJson ? null : await request.formData();
    const json: Json = isJson ? await request.json() : {};
    historyJobId = String(json.historyJobId || '');
    if (historyJobId) {
      historySupabase = await createClient();
      const { data: { user } } = await historySupabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Sign in before saving this analysis.' }, { status: 401 });
      historyNotificationEmail = user.email || '';
      const { data: savedJob } = await historySupabase.from('qa_jobs').select('id,original_blob_url,dubbed_blob_url').eq('id', historyJobId).eq('user_id', user.id).maybeSingle();
      if (!savedJob) return NextResponse.json({ error: 'This QA project does not belong to your account.' }, { status: 404 });
      if (String(json.originalBlobUrl || '') !== savedJob.original_blob_url || String(json.dubbedBlobUrl || '') !== savedJob.dubbed_blob_url) return NextResponse.json({ error: 'The uploaded media does not match this saved QA project.' }, { status: 400 });
      historyOriginalUrl = savedJob.original_blob_url;
      historyDubbedUrl = savedJob.dubbed_blob_url || '';
    }
    progressId = String(form?.get('progressId') || '');
    updateAnalysisProgress(progressId, 'Checking uploaded videos', 12);
    let original: FormDataEntryValue | File | null = form?.get('original') || null;
    let dubbed: FormDataEntryValue | File | null = form?.get('dubbed') || null;
    if (isJson) {
      const originalBlobUrl = String(json.originalBlobUrl || '');
      const dubbedBlobUrl = String(json.dubbedBlobUrl || '');
      if (!originalBlobUrl.startsWith('https://') || !dubbedBlobUrl.startsWith('https://')) return NextResponse.json({ error: 'Both uploaded Blob URLs are required.' }, { status: 400 });
      const [originalBlob, dubbedBlob] = await Promise.all([getBlob(originalBlobUrl, { access: 'private' }), getBlob(dubbedBlobUrl, { access: 'private' })]);
      if (!originalBlob || !dubbedBlob) return NextResponse.json({ error: 'One of the uploaded private videos is missing.' }, { status: 404 });
      const [originalBytes, dubbedBytes] = await Promise.all([new Response(originalBlob.stream).arrayBuffer(), new Response(dubbedBlob.stream).arrayBuffer()]);
      original = new File([originalBytes], String(json.originalName || 'source.mp4'), { type: originalBlob.blob.contentType || 'video/mp4' });
      dubbed = new File([dubbedBytes], 'dub.mp4', { type: dubbedBlob.blob.contentType || 'video/mp4' });
    }
    const sourceLanguage = String(form?.get('sourceLanguage') || json.sourceLanguage || 'Hindi');
    const targetLanguage = String(form?.get('targetLanguage') || json.targetLanguage || 'Tamil');
    historyProjectName = String(form?.get('projectName') || json.projectName || '');
    historySourceLanguage = sourceLanguage;
    historyTargetLanguage = targetLanguage;
    if (!(original instanceof File) || !(dubbed instanceof File)) return NextResponse.json({ error: 'Choose both the original and dubbed media.' }, { status: 400 });
    if (!historyProjectName) historyProjectName = original.name.replace(/\.[^.]+$/, '');
    if (!original.size || !dubbed.size) return NextResponse.json({ error: 'One of the selected files is empty.' }, { status: 400 });
    if (original.size > 450 * 1024 * 1024 || dubbed.size > 450 * 1024 * 1024) return NextResponse.json({ error: 'Each media file must be smaller than 450 MB for this local server.' }, { status: 413 });
    const source = LANGUAGES[sourceLanguage]; const target = LANGUAGES[targetLanguage];
    if (!source || !target) return NextResponse.json({ error: 'That language pair is not enabled yet.' }, { status: 400 });

    if (historyJobId) await sendGmailJobEmail({
      to: historyNotificationEmail,
      outcome: 'started',
      projectName: historyProjectName,
      sourceLanguage,
      targetLanguage,
      detail: 'Your video QA is starting. We will email you again when the report is ready or if the analysis fails.',
      appUrl: new URL(request.url).origin,
    });

    stage = 'Transcribing original and dubbed media';
    updateAnalysisProgress(progressId, stage, 24);
    const [originalResult, dubbedResult] = await Promise.all([
      transcribeWithWhisper(original, source.whisper, source.sarvam, key),
      transcribeWithWhisper(dubbed, target.whisper, target.sarvam, key),
    ]);
    stage = 'Checking transcript and back-translation';
    updateAnalysisProgress(progressId, stage, 66);
    const backTranslation = await backTranslate(dubbedResult.transcript, source.sarvam, target.sarvam, key);
    const heuristicFindings = findings(originalResult.transcript, backTranslation);
    stage = 'Preparing both audio tracks for AI listening';
    updateAnalysisProgress(progressId, stage, 73);
    const [sourceAudio, dubAudio] = await Promise.all([extractCompactAudio(original), extractCompactAudio(dubbed)]);
    stage = 'Gemini checking transcript meaning';
    updateAnalysisProgress(progressId, stage, 82);
    let textFindings: AudioFinding[] = [];
    const transcriptModelsUsed = new Set<string>();
    const audioModelsUsed = new Set<string>();
    let transcriptCrossCheckAvailable = true;
    let transcriptCrossCheckError: string | null = null;
    try {
    textFindings = await geminiTranscriptReview(originalResult, dubbedResult, sourceLanguage, targetLanguage, transcriptModelsUsed);
    } catch (error) {
      transcriptCrossCheckAvailable = false;
      transcriptCrossCheckError = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Gemini error';
      console.warn(`[api/analyze] Transcript cross-check unavailable: ${transcriptCrossCheckError}`);
    }
    const reviewCoverageWarnings: string[] = [];
    if (formatSegments(originalResult.segments).length > 14000 || formatSegments(dubbedResult.segments).length > 14000) reviewCoverageWarnings.push('Timestamped segment context for audio review was truncated.');
    if (!originalResult.segments.length) reviewCoverageWarnings.push('The source transcript has no timing data, so source-side issue locations may be unavailable.');
    if (!dubbedResult.segments.length) reviewCoverageWarnings.push('The dub transcript has no timing data, so dub-side issue locations and transcript playback are unavailable.');
    stage = 'Gemini listening to both audio tracks';
    updateAnalysisProgress(progressId, stage, 88);
    const aiFindings = await geminiAudioReview(originalResult, dubbedResult, sourceAudio, dubAudio, sourceLanguage, targetLanguage, audioModelsUsed);
    const audioFindings = aiFindings.map(item => ({
      ...item,
      evidenceStatus: textFindings.some(check => phrasesSupportSameFinding(item, check)) ? 'cross-checked' as const : 'audio-only' as const,
      source: 'Gemini audio review',
    }));
    const unmatchedTextFindings = textFindings
      .filter(check => !aiFindings.some(item => phrasesSupportSameFinding(item, check)))
      .map(item => ({ ...item, source: 'Gemini transcript cross-check' }));
    const unmatchedTranscriptFindings = heuristicFindings
      .filter(check => !textFindings.some(item => (item.category || '').split('/')[0].toLowerCase() === (check.category || '').split('/')[0].toLowerCase()))
      .map(item => ({ ...item, evidenceStatus: 'transcript-only' as const, source: 'Transcript checks' }));
    const combinedFindings = [
      ...audioFindings,
      ...unmatchedTextFindings,
      ...unmatchedTranscriptFindings,
    ];
    updateAnalysisProgress(progressId, 'Finishing the timestamped report', 97);
    updateAnalysisProgress(progressId, 'Analysis complete', 100, 'complete');
    const report: Json = {
      project: historyProjectName || original.name.replace(/\.[^.]+$/, ''),
      sourceLanguage, targetLanguage, createdAt: new Date().toISOString(),
      originalTranscript: originalResult.transcript, dubbedTranscript: dubbedResult.transcript,
      backTranslation, findings: combinedFindings,
      transcriptCrossCheckAvailable,
      transcriptCrossCheckError,
      audioReviewCompleted: true,
      audioReviewEngine: [...audioModelsUsed].join(', ') || process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      audioReviewFindingCount: aiFindings.length,
      reviewCoverageWarnings,
      reviewComplete: transcriptCrossCheckAvailable && reviewCoverageWarnings.length === 0,
      originalSegments: originalResult.segments, dubbedSegments: dubbedResult.segments,
      timestampsAvailable: originalResult.segments.length > 0 && dubbedResult.segments.length > 0,
      transcriptionEngine: originalResult.engine === dubbedResult.engine ? originalResult.engine : `${originalResult.engine} · ${dubbedResult.engine}`,
      semanticReviewEngine: process.env.GEMINI_API_KEY ? `${[...transcriptModelsUsed].join(', ') || process.env.GEMINI_MODEL || 'gemini-3.8-flash'} transcript review` : null,
      disclaimer: 'The AI listens to both audio tracks and reports suspected issues with time ranges. Treat these as review findings, not a guarantee: speech recognition and audio models can miss mistakes or infer words incorrectly.',
    };
    if (historyJobId && historySupabase) {
      report.originalVideoUrl = historyOriginalUrl;
      report.dubbedVideoUrl = historyDubbedUrl;
      const stored = await put(`satvic-jobs/${crypto.randomUUID()}-qa-report.json`, JSON.stringify(report), { access: 'private', contentType: 'application/json', addRandomSuffix: true });
      await historySupabase.from('qa_jobs').update({ report_blob_url: stored.url, status: 'completed', issue_count: combinedFindings.length, error_message: null, updated_at: new Date().toISOString() }).eq('id', historyJobId);
      await sendGmailJobEmail({
        to: historyNotificationEmail,
        outcome: 'completed',
        projectName: historyProjectName,
        sourceLanguage,
        targetLanguage,
        detail: 'Your dub QA report is ready in Satvic Studio.',
        appUrl: new URL(request.url).origin,
      });
    }
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : providerError(error as Json);
    if (historyJobId && historySupabase) {
      await historySupabase.from('qa_jobs').update({ status: 'failed', error_message: message.slice(0, 2000), updated_at: new Date().toISOString() }).eq('id', historyJobId);
      await sendGmailJobEmail({
        to: historyNotificationEmail,
        outcome: 'failed',
        projectName: historyProjectName || 'Video QA',
        sourceLanguage: historySourceLanguage || 'Unknown',
        targetLanguage: historyTargetLanguage || 'Unknown',
        detail: `${stage}: ${message}`,
        appUrl: new URL(request.url).origin,
      });
    }
    updateAnalysisProgress(progressId, 'Analysis stopped', 100, 'error', message);
    console.error(`[api/analyze] ${stage} failed: ${message || 'Unknown analysis error.'}`);
    const status = message.includes('Whisper worker') || /returned 503/.test(message) ? 503 : /returned 429/.test(message) ? 429 : 502;
    return NextResponse.json({ error: `${stage}: ${message || 'Unknown analysis error.'}` }, { status });
  }
}
