import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Sign in to load live exchange rates.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  const token = process.env.WISE_API_TOKEN;
  if (!token) {
    return Response.json({ error: 'WISE_API_TOKEN is not configured.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }

  try {
    const response = await fetch('https://api.wise.com/2026Q4/rates?source=USD&target=INR', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return Response.json({ error: 'Wise could not provide the current USD to INR rate.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
    }

    const body: unknown = await response.json();
    const quote = Array.isArray(body) ? body.find((item): item is { rate: number; time?: string } =>
      Boolean(item && typeof item === 'object' && 'rate' in item && Number.isFinite(Number(item.rate)))) : null;
    if (!quote) {
      return Response.json({ error: 'Wise returned an invalid exchange rate.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ source: 'USD', target: 'INR', rate: Number(quote.rate), time: quote.time || new Date().toISOString() }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Wise exchange rate request failed.' }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}
