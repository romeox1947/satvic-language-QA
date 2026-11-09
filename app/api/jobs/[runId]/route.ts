import { getRun } from 'workflow/api';
import { get } from '@vercel/blob';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function completedResponse(reportUrl: string, runId: string) {
  const reportBlob = await get(reportUrl, { access: 'private' });
  if (!reportBlob) return Response.json({ error: 'The saved QA report is no longer available in private storage.' }, { status: 502 });
  const report = await new Response(reportBlob.stream).json() as Record<string, any>;
  return Response.json({ runId, status: 'completed', stage: 'Analysis complete', report: {
    ...report,
    originalVideoUrl: `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(report.originalVideoUrl || '')}`,
    dubbedVideoUrl: `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(report.dubbedVideoUrl || '')}`,
  } }, { headers: { 'cache-control': 'no-store' } });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const message = value.message ?? value.error_description ?? value.error ?? value.details;
    if (typeof message === 'string') return message;
    try { return JSON.stringify(error); } catch { /* use fallback */ }
  }
  return 'Could not load this background job.';
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!/^[\w-]{8,160}$/.test(runId)) return Response.json({ error: 'Invalid background job ID.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to view this job.' }, { status: 401 });
    const { data: job, error: jobError } = await supabase.from('qa_jobs').select('id,run_id,status,report_blob_url,error_message').eq('user_id', user.id).or(`run_id.eq.${runId},id.eq.${runId}`).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return Response.json({ error: 'This job does not belong to your account.' }, { status: 404 });
    // The durable workflow may finish before its run metadata is readable again.
    // Supabase already has the durable completion state and private report URL.
    if (job.status === 'completed') {
      if (!job.report_blob_url) return Response.json({ error: 'The job is marked complete, but its QA report URL was not saved.' }, { status: 502 });
      return await completedResponse(job.report_blob_url, runId);
    }
    if (job.status === 'failed') return Response.json({ runId, status: 'failed', error: job.error_message || 'This job failed.', stage: 'Job failed' }, { headers: { 'cache-control': 'no-store' } });
    if (!job.run_id) {
      return Response.json({ runId, status: job.status, stage: 'AI is reviewing both audio tracks' }, { headers: { 'cache-control': 'no-store' } });
    }
    const run = getRun(runId);
    if (!(await run.exists)) return Response.json({ error: 'This background job was not found.' }, { status: 404 });
    const status = await run.status;
    if (status !== 'completed') {
      if (status === 'failed') await supabase.from('qa_jobs').update({ status: 'failed', error_message: 'Background workflow failed. Check Vercel Workflows for its error.' }).eq('user_id', user.id).eq('run_id', runId);
      return Response.json({ runId, status, stage: status === 'failed' ? 'Job failed' : 'Sarvam dubbing and AI QA are running on the server' }, { headers: { 'cache-control': 'no-store' } });
    }
    const result = await run.returnValue as Record<string, any>;
    if (result?.jobError) {
      await supabase.from('qa_jobs').update({ status: 'failed', error_message: String(result.jobError) }).eq('user_id', user.id).eq('run_id', runId);
      return Response.json({ runId, status: 'failed', error: result.jobError, stage: 'Job failed' }, { headers: { 'cache-control': 'no-store' } });
    }
    const reportUrl = result?.reportBlobUrl || job.report_blob_url;
    if (!reportUrl) return Response.json({ error: 'The workflow completed, but no saved QA report URL was found.' }, { status: 502 });
    return await completedResponse(reportUrl, runId);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
