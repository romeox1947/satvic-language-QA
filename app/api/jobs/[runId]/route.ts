import { getRun } from 'workflow/api';
import { get } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!/^[\w-]{8,160}$/.test(runId)) return Response.json({ error: 'Invalid background job ID.' }, { status: 400 });
    const run = getRun(runId);
    if (!(await run.exists)) return Response.json({ error: 'This background job was not found.' }, { status: 404 });
    const status = await run.status;
    if (status !== 'completed') return Response.json({ runId, status, stage: status === 'failed' ? 'Job failed' : 'Sarvam dubbing and AI QA are running on the server' }, { headers: { 'cache-control': 'no-store' } });
    const result = await run.returnValue as Record<string, any>;
    if (result?.jobError) return Response.json({ runId, status: 'failed', error: result.jobError, stage: 'Job failed' }, { headers: { 'cache-control': 'no-store' } });
    const reportBlob = result?.reportBlobUrl ? await get(result.reportBlobUrl, { access: 'private' }) : null;
    if (!reportBlob) return Response.json({ error: 'The workflow completed but its QA report could not be loaded.' }, { status: 502 });
    const report = await new Response(reportBlob.stream).json() as Record<string, any>;
    return Response.json({ runId, status, stage: 'Analysis complete', report: {
      ...report,
      originalVideoUrl: `/api/jobs/media?url=${encodeURIComponent(report.originalVideoUrl || '')}`,
      dubbedVideoUrl: `/api/jobs/media?url=${encodeURIComponent(report.dubbedVideoUrl || '')}`,
    } }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load this background job.';
    return Response.json({ error: message }, { status: 500 });
  }
}
