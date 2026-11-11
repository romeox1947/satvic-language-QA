import { redirect } from 'next/navigation';
import SatvicStudioHome from '@/features/website/SatvicStudioHome';

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  return <SatvicStudioHome />;
}
