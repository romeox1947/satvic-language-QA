import { createClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in to view your project history.' }, { status: 401 });
    const { data, error } = await supabase.from('qa_jobs').select('id, run_id, project_name, original_name, source_language, target_language, status, issue_count, error_message, created_at, updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json({ jobs: data || [], userEmail: user.email || '' }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load project history.';
    return Response.json({ error: message }, { status: 500 });
  }
}
