'use server';

import { redirect } from 'next/navigation';
import { createClient, hasSupabaseConfig } from '@/lib/supabase/server';
import { appUrl } from '@/lib/app-url';

export async function signInWithGoogle() {
  if (!hasSupabaseConfig()) redirect('/login?setup=missing');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${appUrl()}/auth/callback` },
  });
  if (error || !data.url) redirect('/login?error=oauth');
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
