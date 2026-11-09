'use server';

import { redirect } from 'next/navigation';
import { createClient, hasSupabaseConfig } from '../../lib/supabase/server';

export async function signInWithGoogle() {
  if (!hasSupabaseConfig()) redirect('/login?setup=missing');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/callback` },
  });
  if (error || !data.url) redirect('/login?error=oauth');
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
