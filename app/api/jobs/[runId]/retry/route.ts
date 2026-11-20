import { start } from 'workflow/api';
import { createClient } from '../../../../../lib/supabase/server';
import { retryQualityReview } from '../../../../../services/dubbing-workflow';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!/^[\w-]{8,160}$/.test(runId)) return Response.json({ error: 'Invalid project ID.' }, { status: 400 });
    if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.GEMINI_API_KEY || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) || !process.env.WORKFLOW_INTERNAL_TOKEN) {
      return Response.json({ error: 'QA retry is not configured on this deployment.' }, { status: 503 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before retrying QA.' }, { status: 401 });
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId);
    const lookup = supabase.from('qa_jobs').select('id,run_id,project_name,original_name,source_language,target_language,original_blob_url,dubbed_blob_url,status').eq('user_id', user.id);
    const { data: job, error: lookupError } = byId ? await lookup.eq('id', runId).maybeSingle() : await lookup.eq('run_id', runId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!job) return Response.json({ error: 'This project was not found in your account.' }, { status: 404 });
    if (job.status !== 'failed' || !job.dubbed_blob_url) return Response.json({ error: 'This project has no saved dubbed video available for a QA-only retry.' }, { status: 409 });
    if (!job.original_blob_url) return Response.json({ error: 'The original video is no longer available for QA.' }, { status: 409 });

    const claim = supabase.from('qa_jobs').update({ status: 'queued', error_message: null }).eq('id', job.id).eq('user_id', user.id).eq('status', 'failed').not('dubbed_blob_url', 'is', null).select('id').maybeSingle();
    const { data: claimed, error: claimError } = await claim;
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ error: 'This project is already being retried. Refresh the project in a moment.' }, { status: 409 });

    const input = {
      originalBlobUrl: job.original_blob_url,
      dubbedBlobUrl: job.dubbed_blob_url,
      originalName: job.original_name || `${job.project_name}.mp4`,
      sourceLanguage: job.source_language,
      targetLanguage: job.target_language,
      projectName: job.project_name,
      dbJobId: job.id,
      userId: user.id,
      notificationEmail: user.email || '',
    };
    try {
      const run = await start(retryQualityReview, [input]);
      const { error: updateError } = await supabase.from('qa_jobs').update({ run_id: run.runId, status: 'running' }).eq('id', job.id).eq('user_id', user.id);
      if (updateError) throw updateError;
      return Response.json({ runId: run.runId, status: 'running', sarvamRetried: false }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the QA retry.';
      await supabase.from('qa_jobs').update({ status: 'failed', error_message: message }).eq('id', job.id).eq('user_id', user.id);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not retry QA.';
    console.error(`[api/jobs/retry] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
