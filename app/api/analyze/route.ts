import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { updateAnalysisProgress } from './progress-store';

export const runtime = 'nodejs';
export const maxDuration = 1800;

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

function providerError(value: Json): string {
  const candidate = value?.message ?? value?.detail ?? value?.error?.message ?? value?.error ?? value;
  if (typeof candidate === 'string') return candidate;
  try { return JSON.stringify(candidate); } catch { return 'Unrecognized provider error response.'; }
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
  const chunks: string[] = data.timestamps?.chunks || [];
  const starts: number[] = data.timestamps?.start_time_seconds || [];
  const ends: number[] = data.timestamps?.end_time_seconds || [];
  const segments = chunks.map((text, index) => ({ start: starts[index] || 0, end: ends[index] || starts[index] || 0, text }));
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
  const requestBody = JSON.stringify(body);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, cache: 'no-store',
        body: requestBody, signal: AbortSignal.timeout(timeoutMs),
      });
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const pauseMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(10_000, retryAfter * 1000) : 1500 * (attempt + 1);
        await response.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, pauseMs));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const named = error as Error & { cause?: Error & { code?: string } };
      const cause = named.cause;
      const detail = [cause?.code, cause?.message || named.message].filter(Boolean).join(': ');
      if (named.name === 'TimeoutError' || attempt === 2) {
        throw new Error(`Could not reach Gemini after ${attempt + 1} attempt(s): ${detail || 'network request failed'}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
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

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, शून्य: 0, एक: 1, दो: 2, तीन: 3,
  चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, पन्द्रह: 15, सोलह: 16,
  सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20, इक्कीस: 21, बाईस: 22, तेईस: 23,
  चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27, अट्ठाईस: 28, उनतीस: 29,
  तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90,
};

function normalizeDigits(token: string) {
  const zeroPoints = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66];
  return [...token].map(char => {
    const point = char.codePointAt(0) ?? 0;
    const zero = zeroPoints.find(start => point >= start && point <= start + 9);
    return zero === undefined ? char : String(point - zero);
  }).join('');
}

function numberValues(text: string) {
  const values = [...text.matchAll(/[\p{Nd}]+(?:[.,][\p{Nd}]+)*/gu)].map(match => Number(normalizeDigits(match[0]).replace(',', '.'))).filter(Number.isFinite);
  for (const word of text.toLocaleLowerCase().match(/[\p{L}]+/gu) || []) {
    if (Object.hasOwn(NUMBER_WORDS, word)) values.push(NUMBER_WORDS[word]);
  }
  return values.sort((a, b) => a - b);
}

function findings(source: string, backTranslation: string) {
  const result: AudioFinding[] = [];
  const sourceNumbers = numberValues(source); const returnedNumbers = numberValues(backTranslation);
  if (sourceNumbers.join(',') !== returnedNumbers.join(',')) result.push({ severity: 'review', title: 'Numbers or quantities differ', category: 'Numbers/names', detail: `Source values: ${sourceNumbers.join(', ') || 'none'} · Back-translation values: ${returnedNumbers.join(', ') || 'none'}` });
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
  return overlap(audio.sourceQuote || '', text.sourceQuote || '') || overlap(audio.dubQuote || '', text.dubQuote || '');
}

function locatePhrase(segments: Segment[], phrase: string) {
  const words = [...new Set(phrase.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];
  if (!words.length || !segments.length) return { start: undefined, end: undefined };
  let best = { score: 0, first: 0, last: 0 };
  for (let first = 0; first < segments.length; first++) {
    let text = '';
    for (let last = first; last < Math.min(segments.length, first + 5); last++) {
      text += ` ${segments[last].text.toLocaleLowerCase()}`;
      const hits = words.filter(word => text.includes(word)).length;
      const score = hits / words.length;
      if (score > best.score) best = { score, first, last };
      if (score === 1) break;
    }
  }
  return best.score >= 0.4 ? { start: segments[best.first].start, end: segments[best.last].end } : { start: undefined, end: undefined };
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
async function geminiTranscriptReview(source: Transcript, dub: Transcript, backTranslation: string, sourceLanguage: string, targetLanguage: string): Promise<AudioFinding[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return [];
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  const texts = [source.transcript, dub.transcript, backTranslation];
  const chunkCount = Math.max(1, Math.ceil(Math.max(...texts.map(text => text.length)) / 3000));
  const findingsByKey = new Map<string, AudioFinding>();
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const part = (text: string) => text.slice(Math.floor(text.length * chunk / chunkCount), Math.floor(text.length * (chunk + 1) / chunkCount));
    const prompt = `Compare these matching passage portions for dubbing QA (portion ${chunk + 1} of ${chunkCount}, in original order). Source is ${sourceLanguage}; dub transcript is ${targetLanguage}; back-translation is Sarvam's translation of the dub into ${sourceLanguage}. Flag specific meaning changes: incorrect/missing/added claims, quantities or food names, negation/instructions, and omissions. Natural rewording is correct. Use quoted source and dub transcript evidence. Do not infer pronunciation or accent from text, and do not treat back-translation wording differences alone as proof. Return JSON only: {"findings":[{"severity":"critical|review|info","category":"Meaning|Omission/addition|Numbers/names|Other","title":"short issue","detail":"plain English explanation with evidence","sourceQuote":"short source phrase","dubQuote":"short target-language transcript phrase"}]}. Return an empty findings list if no concrete mismatch appears.\n\nSOURCE (${sourceLanguage}):\n${part(texts[0])}\n\nDUB TRANSCRIPT (${targetLanguage}):\n${part(texts[1])}\n\nDUB BACK-TRANSLATION (${sourceLanguage}):\n${part(texts[2])}`;
    const response = await geminiRequest({ model, input: prompt }, key, 5 * 60 * 1000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini transcript cross-check returned ${response.status}: ${providerError(payload)}`);
    const output = typeof payload.output_text === 'string' ? payload.output_text : '';
    const parsed = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (!Array.isArray(parsed.findings)) throw new Error(`Gemini transcript cross-check returned invalid findings for passage ${chunk + 1}.`);
    for (const item of parsed.findings.filter((entry: Json) => entry?.title && entry?.detail && ['critical', 'review', 'info'].includes(entry.severity))) {
      const sourceQuote = String(item.sourceQuote || '').slice(0, 300);
      const dubQuote = String(item.dubQuote || '').slice(0, 300);
      const sourceRange = locatePhrase(source.segments, sourceQuote);
      const dubRange = locatePhrase(dub.segments, dubQuote);
      const finding: AudioFinding = { severity: item.severity, title: String(item.title).slice(0, 140), detail: String(item.detail).slice(0, 1000), category: String(item.category || 'Meaning'), sourceQuote, dubQuote, sourceStart: sourceRange.start, sourceEnd: sourceRange.end, dubStart: dubRange.start, dubEnd: dubRange.end, evidenceStatus: 'transcript-only' };
      findingsByKey.set(`${finding.title}|${sourceQuote}|${dubQuote}`.toLowerCase(), finding);
    }
  }
  return [...findingsByKey.values()];
}
async function geminiAudioReview(source: Transcript, dub: Transcript, sourceAudio: { data: string; mime_type: string }, dubAudio: { data: string; mime_type: string }, sourceLanguage: string, targetLanguage: string): Promise<AudioFinding[]> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return [] as AudioFinding[];
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
  const body = {
    model,
    input: [
      { type: 'text', text: `You are an audio dubbing quality reviewer. You can listen to BOTH attached audio tracks. Track 1 is the original ${sourceLanguage}; track 2 is the finished dub in ${targetLanguage}. Compare the spoken meaning, not just the transcripts. The timestamped transcripts below help locate speech; audio is the evidence. Find only concrete issues a producer can fix: changed or incorrect meaning, mistranslated words or names, omissions/additions, numbers, unclear pronunciation or unintelligible speech, unnatural pacing, obvious voice/accent mismatch that harms intelligibility, missing/extra speech, and audio defects. Do not label a regional accent as wrong just because it differs; only flag if it affects intelligibility or brief requirements. For each issue give the exact start and end time in BOTH tracks where possible (seconds from each track's start), a category, severity (critical/review/info), a concise plain-English explanation with source/dub phrase evidence. Return the zero-based start/end segment indexes for the closest transcript segments (sourceStartSegment, sourceEndSegment, dubStartSegment, dubEndSegment). Use transcript segments as timing anchors. Do not invent issues or exact quotes. If audio or transcripts are unclear, state the uncertainty instead of guessing. Output JSON only: {"findings":[{"severity":"critical|review|info","category":"Meaning|Omission/addition|Numbers/names|Pronunciation/intelligibility|Accent/voice|Pacing/timing|Audio quality|Other","title":"short actionable issue","detail":"what differs and why it may matter","sourceQuote":"short source phrase","dubQuote":"short target-language phrase heard","sourceStart":0,"sourceEnd":1,"dubStart":0,"dubEnd":1,"sourceStartSegment":0,"sourceEndSegment":0,"dubStartSegment":0,"dubEndSegment":0}]}. If no concrete issue is audible, return {"findings":[]}.\n\nSOURCE TRANSCRIPT SEGMENTS (seconds):\n${formatSegments(source.segments)}\n\nDUB TRANSCRIPT SEGMENTS (seconds):\n${formatSegments(dub.segments)}\n\nFull source transcript: ${source.transcript.slice(0, 8000)}\n\nFull dub transcript: ${dub.transcript.slice(0, 8000)}` },
      { type: 'audio', data: sourceAudio.data, mime_type: sourceAudio.mime_type },
      { type: 'audio', data: dubAudio.data, mime_type: dubAudio.mime_type },
    ],
  };
  const requestBytes = Buffer.byteLength(JSON.stringify(body));
  if (requestBytes > 18 * 1024 * 1024) throw new Error('The two audio tracks are too long for one AI listening review. Use shorter clips (about 20 minutes or less) and analyze the video in parts.');
  const response = await geminiRequest(body, key, 10 * 60 * 1000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Gemini audio review returned ${response.status}: ${providerError(payload)}`);
  const output = typeof payload.output_text === 'string' ? payload.output_text : payload.steps?.flatMap((step: Json) => step.content || []).filter((item: Json) => item.type === 'text').map((item: Json) => item.text || '').join('') || '';
  const parsed = JSON.parse(output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
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
  try {
    const form = await request.formData();
    progressId = String(form.get('progressId') || '');
    updateAnalysisProgress(progressId, 'Checking uploaded videos', 12);
    const original = form.get('original'); const dubbed = form.get('dubbed');
    const sourceLanguage = String(form.get('sourceLanguage') || 'Hindi');
    const targetLanguage = String(form.get('targetLanguage') || 'Tamil');
    if (!(original instanceof File) || !(dubbed instanceof File)) return NextResponse.json({ error: 'Choose both the original and dubbed media.' }, { status: 400 });
    if (!original.size || !dubbed.size) return NextResponse.json({ error: 'One of the selected files is empty.' }, { status: 400 });
    if (original.size > 450 * 1024 * 1024 || dubbed.size > 450 * 1024 * 1024) return NextResponse.json({ error: 'Each media file must be smaller than 450 MB for this local server.' }, { status: 413 });
    const source = LANGUAGES[sourceLanguage]; const target = LANGUAGES[targetLanguage];
    if (!source || !target) return NextResponse.json({ error: 'That language pair is not enabled yet.' }, { status: 400 });

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
    let transcriptCrossCheckAvailable = true;
    let transcriptCrossCheckError: string | null = null;
    try {
      textFindings = await geminiTranscriptReview(originalResult, dubbedResult, backTranslation, sourceLanguage, targetLanguage);
    } catch (error) {
      transcriptCrossCheckAvailable = false;
      transcriptCrossCheckError = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Gemini error';
      console.warn(`[api/analyze] Transcript cross-check unavailable: ${transcriptCrossCheckError}`);
    }
    const reviewCoverageWarnings: string[] = [];
    if (formatSegments(originalResult.segments).length > 14000 || formatSegments(dubbedResult.segments).length > 14000) reviewCoverageWarnings.push('Timestamped segment context for audio review was truncated.');
    stage = 'Gemini listening to both audio tracks';
    updateAnalysisProgress(progressId, stage, 88);
    const aiFindings = await geminiAudioReview(originalResult, dubbedResult, sourceAudio, dubAudio, sourceLanguage, targetLanguage);
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
    return NextResponse.json({
      project: String(form.get('projectName') || original.name.replace(/\.[^.]+$/, '')),
      sourceLanguage, targetLanguage, createdAt: new Date().toISOString(),
      originalTranscript: originalResult.transcript, dubbedTranscript: dubbedResult.transcript,
      backTranslation, findings: combinedFindings,
      transcriptCrossCheckAvailable,
      transcriptCrossCheckError,
      reviewCoverageWarnings,
      reviewComplete: transcriptCrossCheckAvailable && reviewCoverageWarnings.length === 0,
      originalSegments: originalResult.segments, dubbedSegments: dubbedResult.segments,
      timestampsAvailable: dubbedResult.segments.length > 0,
      transcriptionEngine: originalResult.engine === dubbedResult.engine ? originalResult.engine : `${originalResult.engine} · ${dubbedResult.engine}`,
      semanticReviewEngine: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_MODEL || 'gemini-3.8-flash'} audio review` : null,
      disclaimer: 'The AI listens to both audio tracks and reports suspected issues with time ranges. Treat these as review findings, not a guarantee: speech recognition and audio models can miss mistakes or infer words incorrectly.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : providerError(error as Json);
    updateAnalysisProgress(progressId, 'Analysis stopped', 100, 'error', message);
    console.error(`[api/analyze] ${stage} failed: ${message || 'Unknown analysis error.'}`);
    const status = message.includes('Whisper worker') || /returned 503/.test(message) ? 503 : /returned 429/.test(message) ? 429 : 502;
    return NextResponse.json({ error: `${stage}: ${message || 'Unknown analysis error.'}` }, { status });
  }
}
