import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Satvic Studio — Dubbing QA',
  description: 'A thoughtful quality workspace for multilingual video dubbing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
