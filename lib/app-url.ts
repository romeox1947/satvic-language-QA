const PRODUCTION_APP_URL = 'https://satvic-language-qa.vercel.app';

export function appUrl(): string {
  if (process.env.VERCEL) return PRODUCTION_APP_URL;
  return (process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}
