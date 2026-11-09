import { get } from '@vercel/blob';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const url = params.get('url') || '';
  const runId = params.get('runId') || '';
  if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(url)) return Response.json({ error: 'Invalid media URL.' }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to view this media.' }, { status: 401 });
    const jobLookup = supabase.from('qa_jobs').select('original_blob_url,dubbed_blob_url').eq('user_id', user.id);
    const { data: job } = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      ? await jobLookup.eq('id', runId).maybeSingle()
      : await jobLookup.eq('run_id', runId).maybeSingle();
    if (!job || ![job.original_blob_url, job.dubbed_blob_url].includes(url)) return Response.json({ error: 'This media does not belong to your account.' }, { status: 404 });
    const result = await get(url, { access: 'private' });
    if (!result) return Response.json({ error: 'Media not found.' }, { status: 404 });
    return new Response(result.stream, { headers: { 'content-type': result.blob.contentType || 'application/octet-stream', 'cache-control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'Could not read this private media file.' }, { status: 502 });
  }
}
