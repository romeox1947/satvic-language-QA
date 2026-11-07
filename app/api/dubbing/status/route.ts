import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const key = process.env.SARVAM_API_KEY?.trim();
  const jobId = new URL(request.url).searchParams.get('jobId') || '';
  if (!key) return NextResponse.json({ error: 'SARVAM_API_KEY is not configured.' }, { status: 503 });
  if (!/^[\w-]{1,100}$/.test(jobId)) return NextResponse.json({ error: 'Invalid Sarvam dubbing job ID.' }, { status: 400 });
  try {
    const headers = { 'api-subscription-key': key };
    const liveResponse = await fetch(`https://api.sarvam.ai/dubbing/jobs/${encodeURIComponent(jobId)}/live-status`, { headers, cache: 'no-store' });
    const liveBody = await liveResponse.json().catch(() => ({}));
    if (!liveResponse.ok) throw new Error(`Sarvam status returned ${liveResponse.status}: ${liveBody.message || liveBody.detail || 'Unknown provider error.'}`);
    const live = liveBody.data || {};
    const result: Record<string, unknown> = { status: live.status || 'in_progress', progress: Number(live.progress) || 0, step: live.current_step_label || 'Sarvam is creating the dub' };
    if (live.status === 'failed') result.error = live.error_message || 'Sarvam dubbing failed.';
    if (['completed', 'partial_failure'].includes(live.status)) {
      const exportResponse = await fetch(`https://api.sarvam.ai/dubbing/jobs/${encodeURIComponent(jobId)}/export-status?limit=100`, { headers, cache: 'no-store' });
      const exportBody = await exportResponse.json().catch(() => ({}));
      if (!exportResponse.ok) throw new Error(`Sarvam export status returned ${exportResponse.status}: ${exportBody.message || exportBody.detail || 'Unknown provider error.'}`);
      const exports = exportBody.data?.exports || [];
      const video = exports.find((item: Record<string, any>) => item.export_type === 'video' && item.status === 'completed' && !item.is_stale);
      const videoFailed = exports.find((item: Record<string, any>) => item.export_type === 'video' && item.status === 'failed');
      if (video?.download_url) result.ready = true;
      else if (videoFailed) result.error = videoFailed.error_message || 'Sarvam could not export the dubbed video.';
      else result.step = 'Sarvam is rendering the dubbed video export';
    }
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not read Sarvam dubbing status.';
    console.error(`[api/dubbing/status] ${detail}`);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
