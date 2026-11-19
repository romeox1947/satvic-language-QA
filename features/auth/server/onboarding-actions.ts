'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isProfileAvatarId } from '@/features/auth/profile-avatar';

const allowedRoles = new Set(['Founder Office', 'Dubbing & Localization', 'Content / QA Reviewer', 'Admin', 'Other']);

export async function completeProfile(formData: FormData) {
  const fullName = String(formData.get('fullName') || '').trim().replace(/\s+/g, ' ');
  const role = String(formData.get('role') || '').trim();
  const avatarId = String(formData.get('avatarId') || '');
  if (fullName.length < 2 || fullName.length > 80 || !allowedRoles.has(role) || !isProfileAvatarId(avatarId)) redirect('/onboarding?error=details');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error: avatarError } = await supabase.auth.updateUser({ data: { avatar_id: avatarId } });
  if (avatarError) redirect('/onboarding?error=save');
  const { error } = await supabase.from('profiles').upsert({ user_id: user.id, full_name: fullName, role }, { onConflict: 'user_id' });
  if (error) redirect('/onboarding?error=save');
  redirect('/dashboard');
}
