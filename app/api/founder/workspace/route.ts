import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createClient } from '@/lib/supabase/server';
import { getB2Client, getB2Config } from '@/lib/b2/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 30;
const MAX_BYTES = 1_500_000;
const EMPTY_DATA = { jobs: [], chatMessages: [], chatSessions: [], activeChatId: null, emailDrafts: [], voicePanels: [], voiceDrafts: {} };

async function getOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function objectKey(userId: string) {
  return `founder-office-data/${userId}.json`;
}

export async function GET() {
  const user = await getOwner();
  if (!user) return Response.json({ error: 'Sign in to load Founder Office data.' }, { status: 401 });

  try {
    const { bucket } = getB2Config();
    const client = getB2Client();
    let response;
    try {
      response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(user.id) }));
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey' || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        return Response.json({ data: EMPTY_DATA, hasSavedData: false }, { headers: { 'cache-control': 'no-store' } });
      }
      throw error;
    }

    const compressed = await response.Body?.transformToByteArray();
    if (!compressed || compressed.byteLength > MAX_BYTES) return Response.json({ data: EMPTY_DATA, hasSavedData: false }, { headers: { 'cache-control': 'no-store' } });
    const raw = gunzipSync(compressed, { maxOutputLength: MAX_BYTES }).toString('utf8');
    const stored = JSON.parse(raw) as { expiresAt?: string; data?: unknown };
    if (!stored.expiresAt || Date.parse(stored.expiresAt) <= Date.now()) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(user.id) }));
      return Response.json({ data: EMPTY_DATA, hasSavedData: false }, { headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ data: stored.data ?? EMPTY_DATA, hasSavedData: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[founder-workspace] Could not load saved data:', error instanceof Error ? error.message : 'Unknown storage error');
    return Response.json({ error: 'Could not load saved Founder Office data. Check the Backblaze B2 configuration.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await getOwner();
  if (!user) return Response.json({ error: 'Sign in to save Founder Office data.' }, { status: 401 });

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Send valid Founder Office data.' }, { status: 400 });
    const allowedFeatures = ['overview', 'founder-mind', 'voice', 'meetings', 'people', 'ideas', 'projects', 'memory'];
    const allowedStatuses = ['captured', 'understood', 'in-progress', 'done'];
    const panelIds = ['announcement', 'workshop', 'applicant', 'product', 'community', 'internal'];
    const data = {
      jobs: Array.isArray(body.jobs) ? body.jobs.slice(0, 100).flatMap((item: Record<string, unknown>) => {
        if (!item || typeof item !== 'object') return [];
        return [{
          id: typeof item.id === 'string' ? item.id.slice(0, 100) : '',
          title: typeof item.title === 'string' ? item.title.slice(0, 200) : '',
          source: typeof item.source === 'string' ? item.source.slice(0, 2000) : '',
          feature: allowedFeatures.includes(String(item.feature)) ? item.feature : 'projects',
          status: allowedStatuses.includes(String(item.status)) ? item.status : 'captured',
          due: typeof item.due === 'string' ? item.due.slice(0, 100) : 'Unscheduled',
          plan: Array.isArray(item.plan) ? item.plan.filter((step): step is string => typeof step === 'string').slice(0, 5).map(step => step.slice(0, 250)) : [],
        }];
      }) : [],
      chatMessages: Array.isArray(body.chatMessages) ? body.chatMessages.slice(-100).map((item: { id?: unknown; role?: unknown; text?: unknown }) => ({
        id: typeof item?.id === 'string' ? item.id.slice(0, 100) : '',
        role: item?.role === 'user' ? 'user' : 'assistant',
        text: typeof item?.text === 'string' ? item.text.slice(0, 2_000) : '',
      })) : [],
      chatSessions: Array.isArray(body.chatSessions) ? body.chatSessions.slice(0, 20).map((session: Record<string, unknown>) => ({
        id: typeof session?.id === 'string' ? session.id.slice(0, 100) : '',
        title: typeof session?.title === 'string' ? session.title.slice(0, 100) : 'New chat',
        updatedAt: typeof session?.updatedAt === 'string' ? session.updatedAt.slice(0, 40) : new Date().toISOString(),
        messages: Array.isArray(session?.messages) ? session.messages.slice(-15).map((message: { id?: unknown; role?: unknown; text?: unknown }) => ({
          id: typeof message?.id === 'string' ? message.id.slice(0, 100) : '',
          role: message?.role === 'user' ? 'user' : 'assistant',
          text: typeof message?.text === 'string' ? message.text.slice(0, 1_000) : '',
        })) : [],
      })) : [],
      activeChatId: typeof body.activeChatId === 'string' ? body.activeChatId.slice(0, 100) : null,
      emailDrafts: Array.isArray(body.emailDrafts) ? body.emailDrafts.slice(0, 15).map((item: Record<string, unknown>) => ({
        to: typeof item?.to === 'string' ? item.to.slice(0, 100) : '',
        subject: typeof item?.subject === 'string' ? item.subject.slice(0, 200) : '',
        body: typeof item?.body === 'string' ? item.body.slice(0, 8_000) : '',
        status: item?.status === 'Ready for review' ? 'Ready for review' : 'Draft Done',
      })) : [],
      voicePanels: Array.isArray(body.voicePanels) ? body.voicePanels.filter((id: unknown) => panelIds.includes(String(id))).slice(0, 6) : [],
      voiceDrafts: Object.fromEntries(panelIds.map(panel => [panel, Array.isArray(body.voiceDrafts?.[panel]) ? body.voiceDrafts[panel].slice(0, 15).map((draft: Record<string, unknown>) => ({
        id: typeof draft?.id === 'string' ? draft.id.slice(0, 100) : '',
        title: typeof draft?.title === 'string' ? draft.title.slice(0, 200) : '',
        content: typeof draft?.content === 'string' ? draft.content.slice(0, 3_000) : '',
        saved: Boolean(draft?.saved),
      })) : []])),
    };
    const now = new Date();
    const record = JSON.stringify({ version: 1, updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(), data });
    if (Buffer.byteLength(record, 'utf8') > MAX_BYTES) return Response.json({ error: 'Founder Office text data exceeds the 1.5 MB limit.' }, { status: 413 });

    const { bucket } = getB2Config();
    await getB2Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey(user.id),
      Body: gzipSync(record),
      ContentType: 'application/json; charset=utf-8',
      ContentEncoding: 'gzip',
      Metadata: { 'expires-at': new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString() },
    }));
    return Response.json({ savedAt: now.toISOString(), expiresInDays: RETENTION_DAYS }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Send valid Founder Office data.' }, { status: 400 });
    console.error('[founder-workspace] Could not save data:', error instanceof Error ? error.message : 'Unknown storage error');
    return Response.json({ error: 'Could not save Founder Office data. Check the Backblaze B2 configuration.' }, { status: 503 });
  }
}
