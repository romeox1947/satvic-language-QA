import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  if (!profile) return NextResponse.redirect(new URL('/onboarding', url.origin));
  return NextResponse.redirect(new URL('/dashboard', url.origin));
}
