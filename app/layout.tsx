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
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" /></head><body>{children}<Analytics /><SpeedInsights /></body></html>;
}
