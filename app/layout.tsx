import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import './landing.css';
import '../features/website/satvic-studio.css';

export const metadata: Metadata = {
  title: 'Satvic Studio | Multilingual Video QA',
  description: 'A private workspace for comparing dubbed audio and reviewing multilingual video quality.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /><SpeedInsights /></body></html>;
}
