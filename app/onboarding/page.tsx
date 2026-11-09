import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { completeProfile } from './actions';
import { createClient, hasSupabaseConfig } from '../../lib/supabase/server';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (!hasSupabaseConfig()) redirect('/login?setup=missing');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('user_id').eq('user_id', user.id).maybeSingle();
  if (profileError) redirect('/login?setup=profile-table');
  if (profile) redirect('/dashboard');
  return (
    <main className="auth-screen">
      <Link href="/" className="auth-back"><span>✳</span> SATVIC STUDIO</Link>
      <section className="auth-card onboarding-card">
        <div className="auth-orb">S</div><p className="auth-kicker">ONE LAST STEP</p>
        <h1>Set up your<br /><em>workspace.</em></h1>
        <p className="auth-copy">Tell us what to call you and what you do. We’ll save your review history to this Google account.</p>
        {params.error === 'details' ? <div className="auth-error">Enter your name and choose a role to continue.</div> : params.error === 'save' ? <div className="auth-error">We couldn’t save your profile. Please try again.</div> : null}
        <form action={completeProfile} className="onboarding-form">
          <label htmlFor="fullName">Your name</label><input id="fullName" name="fullName" type="text" autoComplete="name" defaultValue={user.user_metadata?.full_name || user.user_metadata?.name || ''} placeholder="e.g. Piyush Yadav" minLength={2} maxLength={80} required />
          <label htmlFor="role">Your role</label><select id="role" name="role" defaultValue="" required><option value="" disabled>Select the closest role</option><option>Founder Office</option><option>Dubbing &amp; Localization</option><option>Content / QA Reviewer</option><option>Admin</option><option>Other</option></select>
          <button className="landing-primary onboarding-submit" type="submit">Create my workspace <ArrowRight size={16} /></button>
        </form>
        <div className="auth-privacy"><ShieldCheck size={13} /> Signed in as {user.email || 'your Google account'}</div>
      </section>
      <div className="auth-ambient auth-ambient-one" /><div className="auth-ambient auth-ambient-two" />
    </main>
  );
}
