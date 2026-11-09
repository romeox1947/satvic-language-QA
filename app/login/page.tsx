import AuthPanel from './AuthPanel';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthPanel mode="login" setup={params.setup} error={params.error} />;
}
