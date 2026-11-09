import { start } from 'workflow/api';
import { generateAndReview } from '../../../../services/dubbing-workflow';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;
const LANGUAGES = new Set(['English', 'Hindi', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Bengali', 'Marathi', 'Punjabi', 'Malayalam', 'Odia', 'Assamese']);

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Connect a Vercel Blob store before starting a background job.' }, { status: 503 });
    if (!process.env.SARVAM_API_KEY || !process.env.GEMINI_API_KEY) return Response.json({ error: 'Add SARVAM_API_KEY and GEMINI_API_KEY to the Vercel project environment variables.' }, { status: 503 });
    if (!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return Response.json({ error: 'Add SUPABASE_SECRET_KEY so the background job can save its final status to your history.' }, { status: 503 });
    if (!process.env.WORKFLOW_INTERNAL_TOKEN) return Response.json({ error: 'Add WORKFLOW_INTERNAL_TOKEN so the background workflow can securely call the QA API.' }, { status: 503 });
    const body = await request.json();
    const originalBlobUrl = String(body.originalBlobUrl || '');
    const sourceLanguage = String(body.sourceLanguage || '');
    const targetLanguage = String(body.targetLanguage || '');
    const originalName = String(body.originalName || 'source.mp4').slice(0, 180);
    const projectName = String(body.projectName || originalName.replace(/\.[^.]+$/, '')).slice(0, 120);
    if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(originalBlobUrl)) return Response.json({ error: 'Upload the original video to Blob storage before starting the job.' }, { status: 400 });
    if (!LANGUAGES.has(sourceLanguage) || !LANGUAGES.has(targetLanguage) || sourceLanguage === targetLanguage) return Response.json({ error: 'Choose a supported source and target language, and make sure they differ.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before starting a dubbing job.' }, { status: 401 });
    const { data: job, error: insertError } = await supabase.from('qa_jobs').insert({ user_id: user.id, project_name: projectName, original_name: originalName, source_language: sourceLanguage, target_language: targetLanguage, original_blob_url: originalBlobUrl, status: 'queued' }).select('id').single();
    if (insertError || !job) throw insertError || new Error('Could not save this job to your history.');
    let run;
    try {
      run = await start(generateAndReview, [{ originalBlobUrl, originalName, sourceLanguage, targetLanguage, projectName, dbJobId: job.id, userId: user.id, notificationEmail: user.email || '' }]);
    } catch (error) {
      await supabase.from('qa_jobs').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Could not start workflow.' }).eq('id', job.id);
      throw error;
    }
    await supabase.from('qa_jobs').update({ run_id: run.runId, status: 'running' }).eq('id', job.id);
    return Response.json({
      runId: run.runId,
      status: 'running',
      runsOnVercel: Boolean(process.env.VERCEL),
      emailNotificationsEnabled: Boolean(process.env.MAILJET_API_KEY?.trim() && process.env.MAILJET_SECRET_KEY?.trim() && process.env.MAILJET_FROM_EMAIL?.trim() && user.email),
      notificationEmail: user.email || '',
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start the background dubbing job.';
    console.error(`[api/jobs/start] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
