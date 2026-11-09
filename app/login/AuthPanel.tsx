import Link from 'next/link';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { signInWithGoogle } from './actions';
import { hasSupabaseConfig } from '../../lib/supabase/server';

type AuthPanelProps = { mode: 'login' | 'signup'; setup?: string; error?: string };

export default function AuthPanel({ mode, setup, error }: AuthPanelProps) {
  const configured = hasSupabaseConfig();
  const isSignup = mode === 'signup';
  const setupError = setup === 'missing' || setup === 'profile-table';
  return (
    <main className="auth-screen">
      <Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to Satvic Studio</Link>
      <section className="auth-card">
        <Link href="/" className="auth-brand"><span>✳</span> SATVIC STUDIO</Link>
        <div className="auth-orb">S</div><p className="auth-kicker">DUBBING QUALITY WORKSPACE</p>
        <h1>{isSignup ? <>Make room for<br /><em>better review.</em></> : <>Your QA history,<br /><em>always with you.</em></>}</h1>
        <p className="auth-copy">{isSignup ? 'Create your workspace account to compare dubbed audio and keep your reviews together.' : 'Sign in to upload videos, follow dubbing jobs, and revisit private QA reports from any device.'}</p>
        {setupError ? <div className="auth-error">{setup === 'profile-table' ? <>The profiles table is not ready yet. Run the updated <code>supabase/schema.sql</code> in the Supabase SQL editor.</> : <>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your environment, then redeploy.</>}</div> : error ? <div className="auth-error">Google sign-in did not complete. Start a fresh sign-in and check the Supabase redirect settings if it happens again.</div> : null}
        <form action={signInWithGoogle}><button className="google-signin" type="submit" disabled={!configured}><span className="google-g">G</span>{configured ? 'Continue with Google' : 'Configure Supabase to continue'}<ArrowRight size={16} /></button></form>
        <div className="auth-switch">{isSignup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New to Satvic Studio? <Link href="/signup">Create an account</Link></>}</div>
        <div className="auth-privacy"><ShieldCheck size={13} /> Your projects are private to your account</div>
      </section>
      <div className="auth-ambient auth-ambient-one" /><div className="auth-ambient auth-ambient-two" />
    </main>
  );
}
