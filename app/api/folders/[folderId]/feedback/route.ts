import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
}

function cell(row: unknown[], headers: string[], matches: (header: string) => boolean) {
  const index = headers.findIndex(matches);
  return index < 0 ? '' : String(row[index] ?? '').trim();
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function submissionDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date((value - 25569) * 86400000);
    const day = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return `${day}T12:00:00`;
  }
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(_request: Request, context: { params: Promise<{ folderId: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ error: 'Sign in to view project feedback.' }, { status: 401 });

  try {
    const { folderId } = await context.params;
    const { data: folder, error: folderError } = await supabase.from('qa_folders')
      .select('id, feedback_sheet_url').eq('id', folderId).eq('user_id', user.id).maybeSingle();
    if (folderError) throw folderError;
    if (!folder) return Response.json({ error: 'This folder was not found in your account.' }, { status: 404 });
    if (!folder.feedback_sheet_url) return Response.json({ entries: [], configured: false }, { headers: { 'cache-control': 'no-store' } });

    const spreadsheetId = folder.feedback_sheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!spreadsheetId) return Response.json({ error: 'The response Sheet link saved for this folder is invalid.' }, { status: 400 });
    const savedSheetUrl = new URL(folder.feedback_sheet_url);
    const gid = savedSheetUrl.searchParams.get('gid') || '0';
    const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`);
    csvUrl.searchParams.set('tqx', 'out:csv');
    csvUrl.searchParams.set('gid', gid);
    csvUrl.searchParams.set('headers', '1');
    const sheetResponse = await fetch(csvUrl, { headers: { accept: 'text/csv' }, cache: 'no-store', redirect: 'follow' });
    const csv = await sheetResponse.text();
    if (!sheetResponse.ok || /<html|accounts\.google\.com/i.test(csv.slice(0, 1200))) {
      throw new Error('Could not read this public response Sheet. Set General access to Anyone with the link · Viewer, then save the link again.');
    }
    const [rawHeaders = [], ...rows] = parseCsv(csv.replace(/^\uFEFF/, ''));
    const columns = rawHeaders.map(normalizeHeader);
    const timestampIndex = columns.findIndex(header => header === 'timestamp' || header === 'submitted at' || header === 'submission time');
    if (timestampIndex < 0) return Response.json({ error: 'The response Sheet needs the Google Form Timestamp column in its first row.' }, { status: 422 });
    const entries = rows.flatMap((row, index) => {
      const submittedAt = submissionDate(row[timestampIndex] ?? '');
      if (!submittedAt) return [];
      return [{
        id: `${spreadsheetId}-${index + 2}`,
        submittedAt,
        videoName: cell(row, columns, header => header.includes('video') && !header.includes('timestamp')) || 'Viewer feedback',
        timestamp: cell(row, columns, header => (header.includes('timestamp') && header.includes('video')) || header.includes('video timestamp') || header.includes('time in video')) || 'Timestamp not provided',
        reportedText: cell(row, columns, header => header.includes('wrong') || header.includes('incorrect') || header.includes('issue') || header.includes('reported word') || header.includes('option')) || 'No reported word or option provided',
        suggestedText: cell(row, columns, header => header.includes('expect') || header.includes('correct') || header.includes('suggest') || header.includes('instead')) || undefined,
        note: cell(row, columns, header => header.includes('additional') || header.includes('context') || header.includes('detail') || header === 'other') || undefined,
      }];
    });
    return Response.json({ entries, configured: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not load viewer feedback.' }, { status: 502 });
  }
}
