import { createClient } from '../../../../../../lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ folderId: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: 'Sign in to update project feedback.' }, { status: 401 });

  try {
    const { folderId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(folderId)) {
      return Response.json({ error: 'Choose a valid project folder.' }, { status: 400 });
    }
    const body = await request.json().catch(() => null) as { feedbackId?: unknown } | null;
    const feedbackId = typeof body?.feedbackId === 'string' ? body.feedbackId.trim() : '';
    if (!feedbackId || feedbackId.length > 300) return Response.json({ error: 'Choose a valid feedback report.' }, { status: 400 });

    const { data: folder, error: folderError } = await supabase.from('qa_folders')
      .select('id').eq('id', folderId).eq('user_id', user.id).maybeSingle();
    if (folderError) throw folderError;
    if (!folder) return Response.json({ error: 'This folder was not found in your account.' }, { status: 404 });

    const { error } = await supabase.from('qa_feedback_actions').insert({ user_id: user.id, folder_id: folderId, feedback_id: feedbackId });
    if (error && error.code !== '23505') throw error;
    return Response.json({ acted: true, feedbackId }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not mark this feedback as actioned.' }, { status: 500 });
  }
}
