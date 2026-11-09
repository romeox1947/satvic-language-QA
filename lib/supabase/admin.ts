import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from './url';

export function createAdminClient() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = rawUrl ? normalizeSupabaseUrl(rawUrl) : undefined;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Background history updates need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
