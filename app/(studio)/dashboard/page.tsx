import { redirect } from 'next/navigation';
import { createClient, hasSupabaseConfig } from '@/lib/supabase/server';
import SatvicOverviewDashboard from '@/features/dashboard/client/SatvicOverviewDashboard';
import { getProfileAvatarId } from '@/features/auth/profile-avatar';

export default async function DashboardPage() {
  if (!hasSupabaseConfig()) redirect('/login?setup=missing');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error } = await supabase.from('profiles').select('user_id, full_name').eq('user_id', user.id).maybeSingle();
  if (error) redirect('/login?setup=profile-table');
  if (!profile) redirect('/onboarding');
  return <SatvicOverviewDashboard accountName={profile.full_name || user.email?.split('@')[0] || 'Satvic member'} accountEmail={user.email || ''} accountAvatar={getProfileAvatarId(user.user_metadata?.avatar_id)} />;
}
