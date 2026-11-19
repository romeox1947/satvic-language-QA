import { createClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to view your folders.' }, { status: 401 });
    const { data, error } = await supabase.from('qa_folders').select('id, name, created_at').eq('user_id', user.id).order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ folders: data || [] }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load your folders.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before creating a folder.' }, { status: 401 });
    const body = await request.json().catch(() => null) as { name?: unknown } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return Response.json({ error: 'Enter a folder name.' }, { status: 400 });
    if (name.length > 80) return Response.json({ error: 'Folder names must be 80 characters or fewer.' }, { status: 400 });
    const { data, error } = await supabase.from('qa_folders').insert({ user_id: user.id, name }).select('id, name, created_at').single();
    if (error?.code === '23505') return Response.json({ error: 'You already have a folder with that name.' }, { status: 409 });
    if (error || !data) throw error || new Error('Could not create this folder.');
    return Response.json({ folder: data }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create this folder.' }, { status: 500 });
  }
}
