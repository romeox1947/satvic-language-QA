import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '../../../../../../lib/supabase/server';
import { getB2Client, getB2Config } from '../../../../../../lib/b2/client';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const track = new URL(request.url).searchParams.get('track');
    if (!/^[\w-]{8,160}$/.test(runId) || (track !== 'source' && track !== 'dub')) return Response.json({ error: 'Invalid B2 media request.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to view this media.' }, { status: 401 });
    const lookup = supabase.from('qa_jobs').select('id,run_id,original_b2_key,dubbed_b2_key').eq('user_id', user.id);
    const { data: job, error } = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      ? await lookup.eq('id', runId).maybeSingle()
      : await lookup.eq('run_id', runId).maybeSingle();
    if (error) throw error;
    if (!job) return Response.json({ error: 'This job does not belong to your account.' }, { status: 404 });
    const key = track === 'source' ? job.original_b2_key : job.dubbed_b2_key;
    if (!key) return Response.json({ error: 'This video is not archived in Backblaze B2.' }, { status: 404 });
    const config = getB2Config();
    const range = request.headers.get('range') || undefined;
    const media = await getB2Client().send(new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: range }));
    if (!media.Body) return Response.json({ error: 'Backblaze B2 returned an empty media object.' }, { status: 502 });
    const headers = new Headers({ 'content-type': media.ContentType || 'video/mp4', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' });
    if (media.ContentLength !== undefined) headers.set('content-length', String(media.ContentLength));
    if (media.ContentRange) headers.set('content-range', media.ContentRange);
    return new Response(media.Body.transformToWebStream(), { status: range ? 206 : 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not stream media from Backblaze B2.';
    console.error(`[api/jobs/b2/media] ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }
}
