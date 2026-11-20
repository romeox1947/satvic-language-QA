import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Sign in to load live exchange rates.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/INR', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return Response.json({ error: 'The exchange rate service is unavailable.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
    }

    const quote = await response.json() as { rate?: number; date?: string };
    if (!Number.isFinite(quote.rate)) {
      return Response.json({ error: 'The exchange rate service returned an invalid rate.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ source: 'USD', target: 'INR', rate: Number(quote.rate), time: quote.date || new Date().toISOString() }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Exchange rate request failed.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}
