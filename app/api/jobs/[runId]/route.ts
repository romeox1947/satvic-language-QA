import { getRun } from 'workflow/api';
import { get } from '@vercel/blob';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
    if (!job.run_id) {
      if (job.status === 'failed') return Response.json({ runId, status: 'failed', error: job.error_message || 'This analysis failed.', stage: 'Analysis failed' }, { headers: { 'cache-control': 'no-store' } });
      if (job.status !== 'completed' || !job.report_blob_url) return Response.json({ runId, status: job.status, stage: 'AI is reviewing both audio tracks' }, { headers: { 'cache-control': 'no-store' } });
      const reportBlob = await get(job.report_blob_url, { access: 'private' });
      if (!reportBlob) return Response.json({ error: 'The saved QA report could not be loaded.' }, { status: 502 });
      const report = await new Response(reportBlob.stream).json() as Record<string, any>;
      return Response.json({ runId, status: 'completed', stage: 'Analysis complete', report: {
        ...report,
        originalVideoUrl: `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(report.originalVideoUrl || '')}`,
        dubbedVideoUrl: `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(report.dubbedVideoUrl || '')}`,
      } }, { headers: { 'cache-control': 'no-store' } });
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
    const reportBlob = result?.reportBlobUrl ? await get(result.reportBlobUrl, { access: 'private' }) : null;
    if (!reportBlob) return Response.json({ error: 'The workflow completed but its QA report could not be loaded.' }, { status: 502 });
    const report = await new Response(reportBlob.stream).json() as Record<string, any>;
    return Response.json({ runId, status, stage: 'Analysis complete', report: {
      ...report,
      originalVideoUrl: `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(report.originalVideoUrl || '')}`,
      dubbedVideoUrl: `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(report.dubbedVideoUrl || '')}`,
    } }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load this background job.';
    return Response.json({ error: message }, { status: 500 });
  }
}
