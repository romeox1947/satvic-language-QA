import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Sign in to load workspace preferences.' }, { status: 401 });
  return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Sign in to update workspace preferences.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== 'boolean') return Response.json({ error: 'Choose whether Satvic Dashboard is on or off.' }, { status: 400 });
  if (body.enabled) return Response.json({ error: 'Satvic Dashboard is coming soon.', enabled: false }, { status: 409, headers: { 'cache-control': 'no-store' } });
  return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } });
}
