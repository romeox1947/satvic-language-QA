import { notFound, redirect } from 'next/navigation';
import { getProduct } from '@/features/products/registry';
import { createClient, hasSupabaseConfig } from '@/lib/supabase/server';
import SatvicFluidDashboard from '@/features/products/satvic-fluid/client/SatvicFluidDashboard';
import FounderOfficeDashboard from '@/features/products/founder-office/client/FounderOfficeDashboard';
import { getProfileAvatarId } from '@/features/auth/profile-avatar';

export default async function ProductDashboardPage({ params }: { params: Promise<{ productId: string }> }) {
  if (!hasSupabaseConfig()) redirect('/login?setup=missing');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error } = await supabase.from('profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (error) redirect('/login?setup=profile-table');
  if (!profile) redirect('/onboarding');

  const { productId } = await params;
  const product = getProduct(productId);
  if (!product) notFound();

  const founderOfficeEnabled = user.user_metadata?.founder_office_enabled === true;
  if (product.id === 'founder-office' && !founderOfficeEnabled) redirect('/dashboard/satvic-fluid');
  if (product.id === 'satvic-fluid') return <SatvicFluidDashboard initialAccountEmail={user.email ?? ''} initialAccountAvatar={getProfileAvatarId(user.user_metadata?.avatar_id)} initialAccountUserId={user.id} initialFounderOfficeEnabled={founderOfficeEnabled} />;
  return <FounderOfficeDashboard accountEmail={user.email ?? ''} initialFounderOfficeEnabled={founderOfficeEnabled} />;
}
