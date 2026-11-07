import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 1800;

export async function GET(request: Request) {
  const key = process.env.SARVAM_API_KEY?.trim();
  const jobId = new URL(request.url).searchParams.get('jobId') || '';
  if (!key) return NextResponse.json({ error: 'SARVAM_API_KEY is not configured.' }, { status: 503 });
  if (!/^[\w-]{1,100}$/.test(jobId)) return NextResponse.json({ error: 'Invalid Sarvam dubbing job ID.' }, { status: 400 });
  try {
    const response = await fetch(`https://api.sarvam.ai/dubbing/jobs/${encodeURIComponent(jobId)}/export-status?limit=100`, { headers: { 'api-subscription-key': key }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Sarvam export lookup returned ${response.status}: ${body.message || body.detail || 'Unknown provider error.'}`);
    const item = (body.data?.exports || []).find((entry: Record<string, any>) => entry.export_type === 'video' && entry.status === 'completed' && !entry.is_stale && entry.download_url);
    if (!item) return NextResponse.json({ error: 'Sarvam has not finished exporting the dubbed video yet.' }, { status: 409 });
    const download = await fetch(item.download_url, { cache: 'no-store', signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!download.ok || !download.body) throw new Error(`Downloading the completed Sarvam dub failed (${download.status}).`);
    return new Response(download.body, { headers: { 'content-type': download.headers.get('content-type') || 'video/mp4', 'content-disposition': 'attachment; filename="sarvam-dub.mp4"', 'cache-control': 'no-store' } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Could not download the dubbed video.';
    console.error(`[api/dubbing/download] ${detail}`);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
