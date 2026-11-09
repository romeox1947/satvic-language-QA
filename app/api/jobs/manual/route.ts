import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Sign in before starting an analysis.' }, { status: 401 });
    const body = await request.json();
    const projectName = String(body.projectName || 'Dub review').slice(0, 120);
    const originalName = String(body.originalName || 'source video').slice(0, 180);
    const sourceLanguage = String(body.sourceLanguage || '');
    const targetLanguage = String(body.targetLanguage || '');
    const originalBlobUrl = String(body.originalBlobUrl || '');
    const dubbedBlobUrl = String(body.dubbedBlobUrl || '');
    if (!/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(originalBlobUrl) || !/^https:\/\/.+\.blob\.vercel-storage\.com\//.test(dubbedBlobUrl)) return Response.json({ error: 'Upload both media files to private Blob storage first.' }, { status: 400 });
    const { data, error } = await supabase.from('qa_jobs').insert({ user_id: user.id, project_name: projectName, original_name: originalName, source_language: sourceLanguage, target_language: targetLanguage, original_blob_url: originalBlobUrl, dubbed_blob_url: dubbedBlobUrl, status: 'running' }).select('id').single();
    if (error || !data) throw error || new Error('Could not create a saved QA project.');
    return Response.json({ jobId: data.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create the QA project.' }, { status: 500 });
  }
}
