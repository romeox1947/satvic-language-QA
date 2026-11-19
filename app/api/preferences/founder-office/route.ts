import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Sign in to load workspace preferences.' }, { status: 401 });
  return Response.json({ enabled: user.user_metadata?.founder_office_enabled === true }, { headers: { 'cache-control': 'no-store' } });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Sign in to update workspace preferences.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (!body || typeof body.enabled !== 'boolean') return Response.json({ error: 'Choose whether Founder Office is on or off.' }, { status: 400 });

  const { data, error: updateError } = await supabase.auth.updateUser({
    data: { ...user.user_metadata, founder_office_enabled: body.enabled },
  });
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
  return Response.json({ enabled: data.user.user_metadata?.founder_office_enabled === true }, { headers: { 'cache-control': 'no-store' } });
}
