import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { normalizeSupabaseUrl } from './lib/supabase/url';

export async function middleware(request: NextRequest) {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = rawUrl ? normalizeSupabaseUrl(rawUrl) : undefined;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  const isPublicPage = pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isAuthCallback = request.nextUrl.pathname === '/auth/callback';
  const internalToken = process.env.WORKFLOW_INTERNAL_TOKEN;
  if (pathname === '/api/analyze' && internalToken && request.headers.get('x-workflow-internal') === internalToken) return NextResponse.next();
  if (!url || !key) {
    if (isPublicPage || isAuthCallback) return NextResponse.next();
    return NextResponse.redirect(new URL('/login?setup=missing', request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !isPublicPage && !isAuthCallback) return NextResponse.redirect(new URL('/login', request.url));
  if (user && isAuthPage) return NextResponse.redirect(new URL('/dashboard/satvic-fluid', request.url));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|fonts/|favicon.ico|\\.well-known/workflow|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|otf|woff|woff2)$).*)'],
};
