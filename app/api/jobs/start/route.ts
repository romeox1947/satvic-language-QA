import { start } from 'workflow/api';
import { generateAndReview } from '../../../../services/dubbing-workflow';

export const runtime = 'nodejs';
export const maxDuration = 60;
const LANGUAGES = new Set(['English', 'Hindi', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Bengali', 'Marathi', 'Punjabi', 'Malayalam', 'Odia', 'Assamese']);

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Connect a Vercel Blob store before starting a background job.' }, { status: 503 });
    if (!process.env.SARVAM_API_KEY || !process.env.GEMINI_API_KEY) return Response.json({ error: 'Add SARVAM_API_KEY and GEMINI_API_KEY to the Vercel project environment variables.' }, { status: 503 });
    const body = await request.json();
    const originalBlobUrl = String(body.originalBlobUrl || '');
    const sourceLanguage = String(body.sourceLanguage || '');
    const targetLanguage = String(body.targetLanguage || '');
    const originalName = String(body.originalName || 'source.mp4').slice(0, 180);
    const projectName = String(body.projectName || originalName.replace(/\.[^.]+$/, '')).slice(0, 120);
    if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(originalBlobUrl)) return Response.json({ error: 'Upload the original video to Blob storage before starting the job.' }, { status: 400 });
    if (!LANGUAGES.has(sourceLanguage) || !LANGUAGES.has(targetLanguage) || sourceLanguage === targetLanguage) return Response.json({ error: 'Choose a supported source and target language, and make sure they differ.' }, { status: 400 });
    const run = await start(generateAndReview, [{ originalBlobUrl, originalName, sourceLanguage, targetLanguage, projectName }]);
    return Response.json({ runId: run.runId, status: 'running' }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start the background dubbing job.';
    console.error(`[api/jobs/start] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
