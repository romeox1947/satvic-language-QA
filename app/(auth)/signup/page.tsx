import AuthPanel from '@/features/auth/components/AuthPanel';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthPanel mode="signup" setup={params.setup} error={params.error} />;
}
