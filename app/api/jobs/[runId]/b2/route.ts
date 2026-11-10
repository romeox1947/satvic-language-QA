import { Readable } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import { del, get } from '@vercel/blob';
import { createClient } from '../../../../../lib/supabase/server';
import { getB2Client, getB2Config } from '../../../../../lib/b2/client';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Asset = { kind: 'source' | 'dub' | 'report'; blobUrl: string | null; key: string; contentType: string };
const safe = (value: string) => value.replace(/[^\w.-]+/g, '-').slice(0, 120) || 'video';

async function uploadAsset(asset: Asset, bucket: string) {
  if (!asset.blobUrl) throw new Error(`The ${asset.kind} file is missing from Vercel storage.`);
  const blob = await get(asset.blobUrl, { access: 'private' });
  if (!blob || blob.statusCode !== 200 || !blob.stream || !blob.blob.size) throw new Error(`The ${asset.kind} file is no longer available as a complete Vercel Blob.`);
  const body = Readable.fromWeb(blob.stream as import('node:stream/web').ReadableStream<Uint8Array>);
  await new Upload({
    client: getB2Client(),
    params: { Bucket: bucket, Key: asset.key, Body: body, ContentLength: blob.blob.size, ContentType: blob.blob.contentType || asset.contentType, Metadata: { 'satvic-asset': asset.kind } },
    partSize: 8 * 1024 * 1024,
    queueSize: 2,
    leavePartsOnError: false,
  }).done();
}

async function clearVercelCopies(supabase: Awaited<ReturnType<typeof createClient>>, job: { id: string; original_blob_url: string | null; dubbed_blob_url: string | null; report_blob_url: string | null }) {
  const urls = [job.original_blob_url, job.dubbed_blob_url, job.report_blob_url].filter((url): url is string => Boolean(url));
  if (!urls.length) return { deleted: true };
  try {
    await del(urls);
    const { error } = await supabase.from('qa_jobs').update({ original_blob_url: null, dubbed_blob_url: null, report_blob_url: null, updated_at: new Date().toISOString() }).eq('id', job.id);
    if (error) return { deleted: true, warning: `B2 has the complete archive, but Vercel cleanup metadata needs attention: ${error.message}` };
    return { deleted: true };
  } catch (error) {
    return { deleted: false, warning: `B2 has the complete archive, but Vercel copies could not be deleted yet: ${error instanceof Error ? error.message : 'unknown deletion error'}` };
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!/^[\w-]{8,160}$/.test(runId)) return Response.json({ error: 'Invalid job ID.' }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before archiving this report.' }, { status: 401 });
    const lookup = supabase.from('qa_jobs').select('id,run_id,status,project_name,original_name,source_language,target_language,original_blob_url,dubbed_blob_url,report_blob_url,original_b2_key,dubbed_b2_key,report_b2_key').eq('user_id', user.id);
    const { data: job, error } = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)
      ? await lookup.eq('id', runId).maybeSingle()
      : await lookup.eq('run_id', runId).maybeSingle();
    if (error) throw error;
    if (!job) return Response.json({ error: 'This job does not belong to your account.' }, { status: 404 });
    if (job.status !== 'completed') return Response.json({ error: 'Wait until the job is complete before archiving it.' }, { status: 409 });
    const config = getB2Config();
    getB2Client();
    const prefix = `satvic-archive/${user.id}/${job.id}`;
    const sourceExtension = job.original_name.match(/\.[a-z\d]{1,8}$/i)?.[0] || '.mp4';
    const assets: Asset[] = [
      { kind: 'source', blobUrl: job.original_blob_url, key: job.original_b2_key || `${prefix}/source${sourceExtension}`, contentType: 'video/mp4' },
      { kind: 'dub', blobUrl: job.dubbed_blob_url, key: job.dubbed_b2_key || `${prefix}/dub.mp4`, contentType: 'video/mp4' },
      { kind: 'report', blobUrl: job.report_blob_url, key: job.report_b2_key || `${prefix}/qa-report.json`, contentType: 'application/json' },
    ];
    for (const asset of assets) {
      if (asset.kind === 'source' ? job.original_b2_key : asset.kind === 'dub' ? job.dubbed_b2_key : job.report_b2_key) continue;
      await uploadAsset(asset, config.bucket);
    }
    const { error: saveError } = await supabase.from('qa_jobs').update({ original_b2_key: assets[0].key, dubbed_b2_key: assets[1].key, report_b2_key: assets[2].key, updated_at: new Date().toISOString() }).eq('id', job.id).eq('user_id', user.id);
    if (saveError) throw new Error(`Backblaze B2 received all three files, but Satvic Studio could not save their archive keys: ${saveError.message}. Vercel copies were kept.`);
    const cleanup = await clearVercelCopies(supabase, job);
    return Response.json({ archived: true, originalB2Key: assets[0].key, dubbedB2Key: assets[1].key, reportB2Key: assets[2].key, vercelCopyDeleted: cleanup.deleted, warning: cleanup.warning || null, mediaPath: `/api/jobs/${encodeURIComponent(runId)}/b2/media` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the complete archive to Backblaze B2.';
    console.error(`[api/jobs/b2] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}
