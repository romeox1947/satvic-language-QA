import { NextResponse } from 'next/server';
import { getAnalysisProgress } from '../progress-store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing analysis ID.' }, { status: 400 });
  const progress = getAnalysisProgress(id);
  return NextResponse.json(progress ?? { id, stage: 'Uploading videos to the local analyzer', percent: 3, status: 'processing', startedAt: Date.now() }, { headers: { 'cache-control': 'no-store' } });
}
