import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function getDisplayName(user: { user_metadata?: Record<string, unknown>; email?: string }) {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const emailName = user.email?.split('@')[0];
  const candidate = String(metadataName || emailName || 'Satvic User').trim().replace(/\s+/g, ' ').slice(0, 80);
  return candidate.length >= 2 ? candidate : 'Satvic User';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=oauth', url.origin));

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(new URL('/login?error=oauth', url.origin));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?error=oauth', url.origin));

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.redirect(new URL('/login?setup=profile-table', url.origin));

  if (!profile) {
    const { error: createProfileError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: getDisplayName(user),
      role: 'Other',
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (createProfileError) return NextResponse.redirect(new URL('/login?setup=profile-table', url.origin));
  }

  return NextResponse.redirect(new URL('/dashboard/satvic-fluid', url.origin));
}
