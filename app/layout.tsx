import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import './landing.css';

export const metadata: Metadata = {
  title: 'Satvic Studio | Dubbing QA',
  description: 'A thoughtful quality workspace for multilingual video dubbing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /><SpeedInsights /></body></html>;
}
