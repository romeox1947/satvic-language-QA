import { getB2Config } from '../../../../lib/b2/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    getB2Config();
    return Response.json({ configured: true }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ configured: false }, { headers: { 'cache-control': 'no-store' } });
  }
}
