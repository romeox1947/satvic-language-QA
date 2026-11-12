import { getRun } from 'workflow/api';
import { del, get } from '@vercel/blob';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '../../../../lib/supabase/server';
import { getB2Client, getB2Config } from '../../../../lib/b2/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function completedResponse(job: Record<string, any>, runId: string) {
  let report: Record<string, any>;
  if (job.report_b2_key) {
    const config = getB2Config();
    const response = await getB2Client().send(new GetObjectCommand({ Bucket: config.bucket, Key: job.report_b2_key }));
    if (!response.Body) return Response.json({ error: 'Could not load the saved QA report from Backblaze B2.' }, { status: 502 });
    report = JSON.parse(await response.Body.transformToString()) as Record<string, any>;
  } else if (job.report_blob_url) {
    const reportBlob = await get(job.report_blob_url, { access: 'private' });
    if (!reportBlob) return Response.json({ error: 'The saved QA report is no longer available in private storage.' }, { status: 502 });
    report = await new Response(reportBlob.stream).json() as Record<string, any>;
  } else {
    return Response.json({ error: 'The QA report is not available in Vercel Blob or Backblaze B2.' }, { status: 502 });
  }
  return Response.json({ runId, status: 'completed', stage: 'Analysis complete', report: {
    ...report,
    project: job.project_name || report.project,
    originalVideoUrl: job.original_b2_key
      ? `/api/jobs/${encodeURIComponent(runId)}/b2/media?track=source`
      : job.original_blob_url ? `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(job.original_blob_url)}` : null,
    dubbedVideoUrl: job.dubbed_b2_key
      ? `/api/jobs/${encodeURIComponent(runId)}/b2/media?track=dub`
      : job.dubbed_blob_url ? `/api/jobs/media?runId=${encodeURIComponent(runId)}&url=${encodeURIComponent(job.dubbed_blob_url)}` : null,
    originalB2Key: job.original_b2_key,
    dubbedB2Key: job.dubbed_b2_key,
    reportB2Key: job.report_b2_key,
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
    const jobLookup = supabase.from('qa_jobs').select('id,run_id,project_name,status,report_blob_url,error_message,original_blob_url,dubbed_blob_url,original_b2_key,dubbed_b2_key,report_b2_key').eq('user_id', user.id);
    const { data: job, error: jobError } = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      ? await jobLookup.eq('id', runId).maybeSingle()
      : await jobLookup.eq('run_id', runId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) return Response.json({ error: 'This job does not belong to your account.' }, { status: 404 });
    // The durable workflow may finish before its run metadata is readable again.
    // Supabase already has the durable completion state and private report URL.
    if (job.status === 'completed') {
      return await completedResponse(job, runId);
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
    const completedJob = { ...job, report_blob_url: job.report_blob_url || result?.reportBlobUrl };
    return await completedResponse(completedJob, runId);
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!/^[\w-]{8,160}$/.test(runId)) return Response.json({ error: 'Invalid project ID.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to delete this project.' }, { status: 401 });
    const lookup = supabase.from('qa_jobs').select('id,status,original_blob_url,dubbed_blob_url,report_blob_url,original_b2_key,dubbed_b2_key,report_b2_key').eq('user_id', user.id);
    const { data: job, error: lookupError } = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      ? await lookup.eq('id', runId).maybeSingle()
      : await lookup.eq('run_id', runId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!job) return Response.json({ error: 'This project was not found in your account.' }, { status: 404 });
    if (job.status === 'queued' || job.status === 'running') return Response.json({ error: 'This project is still processing. Wait for it to finish before deleting it.' }, { status: 409 });

    const blobUrls = [job.original_blob_url, job.dubbed_blob_url, job.report_blob_url].filter((value): value is string => Boolean(value));
    if (blobUrls.length && !process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: 'Vercel Blob is not configured, so this project’s stored files cannot be deleted safely.' }, { status: 503 });
    if (blobUrls.length) await del([...new Set(blobUrls)]);

    const b2Keys = [job.original_b2_key, job.dubbed_b2_key, job.report_b2_key].filter((value): value is string => Boolean(value));
    if (b2Keys.length) {
      const config = getB2Config();
      await Promise.all(b2Keys.map(Key => getB2Client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))));
    }

    const { error: deleteError } = await supabase.from('qa_jobs').delete().eq('id', job.id).eq('user_id', user.id);
    if (deleteError) throw deleteError;
    return Response.json({ deleted: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[api/jobs/delete] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!/^[\w-]{8,160}$/.test(runId)) return Response.json({ error: 'Invalid background job ID.' }, { status: 400 });
    const body = await request.json().catch(() => null) as { projectName?: unknown } | null;
    if (typeof body?.projectName !== 'string') return Response.json({ error: 'A project name is required.' }, { status: 400 });
    const projectName = body.projectName.trim();
    if (!projectName) return Response.json({ error: 'Project names cannot be empty.' }, { status: 400 });
    if (projectName.length > 120) return Response.json({ error: 'Project names must be 120 characters or fewer.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to rename this project.' }, { status: 401 });

    const update = supabase.from('qa_jobs').update({ project_name: projectName }).eq('user_id', user.id);
    const { data: job, error } = await (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      ? update.eq('id', runId)
      : update.eq('run_id', runId)).select('project_name').maybeSingle();
    if (error) throw error;
    if (!job) return Response.json({ error: 'This project does not belong to your account.' }, { status: 404 });
    return Response.json({ projectName: job.project_name });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
