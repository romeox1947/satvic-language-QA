import { get } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url') || '';
  if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(url)) return Response.json({ error: 'Invalid media URL.' }, { status: 400 });
  try {
    const result = await get(url, { access: 'private' });
    if (!result) return Response.json({ error: 'Media not found.' }, { status: 404 });
    return new Response(result.stream, { headers: { 'content-type': result.blob.contentType || 'application/octet-stream', 'cache-control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'Could not read this private media file.' }, { status: 502 });
  }
}
