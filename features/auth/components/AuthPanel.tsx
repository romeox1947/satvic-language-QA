import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { signInWithGoogle } from '@/features/auth/server/actions';
import { hasSupabaseConfig } from '@/lib/supabase/server';

type AuthPanelProps = { mode: 'login' | 'signup'; setup?: string; error?: string };

export default function AuthPanel({ mode, setup, error }: AuthPanelProps) {
  const configured = hasSupabaseConfig();
  const isSignup = mode === 'signup';
  const setupError = setup === 'missing' || setup === 'profile-table';
  return (
    <main className="auth-screen auth-v2">
      <div className="auth-layout">
        <section className="auth-main-panel">
          <header className="auth-v2-header">
            <Link href="/" className="auth-v2-brand"><img src="https://satvicmovement.org/images/favicon.png" alt=""/><span>Satvic Studio</span></Link>
            <span className="auth-header-label">LANGUAGE QA WORKSPACE</span>
          </header>
          <div className="auth-v2-content">
            <p className="auth-v2-eyebrow">YOUR WORKSPACE, READY WHEN YOU ARE</p>
            <h1>{isSignup ? <>Join Satvic<br/><em>Studio.</em></> : <>Welcome back<br/><em>to your studio.</em></>}</h1>
            <p className="auth-v2-copy">{isSignup ? 'Create your workspace with Google, then add your name and role to get started.' : 'Sign in to continue your reviews and return to your team workspace.'}</p>
            {setupError ? <div className="auth-error">{setup === 'profile-table' ? <>The profiles table is not ready yet. Run the updated <code>supabase/schema.sql</code> in the Supabase SQL editor.</> : <>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your environment, then redeploy.</>}</div> : error ? <div className="auth-error">Google sign-in did not complete. Start a fresh sign-in and check the Supabase redirect settings if it happens again.</div> : null}
            <div className="auth-v2-provider-note"><ShieldCheck size={15}/><span>{isSignup ? 'Use your Google account to create a secure workspace.' : 'Continue securely with the Google account linked to your workspace.'}</span></div>
            <form action={signInWithGoogle} className="auth-v2-form"><button className="auth-v2-google" type="submit" disabled={!configured}><span className="auth-v2-google-mark">G</span><span>{configured ? (isSignup ? 'Sign up with Google' : 'Continue with Google') : 'Configure Supabase to continue'}</span><ArrowRight size={17}/></button></form>
            <div className="auth-v2-switch">{isSignup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New to Satvic Studio? <Link href="/signup">Create an account</Link></>}</div>
            <div className="auth-v2-privacy"><span className="auth-v2-privacy-mark"><ShieldCheck size={14}/></span><span>Your workspace and review history stay private to your account.</span></div>
          </div>
          <footer className="auth-v2-footer"><span>© {new Date().getFullYear()} Satvic Studio</span><Link href="/">Back to website <ArrowRight size={13}/></Link></footer>
        </section>
        <aside className="auth-art-panel" aria-label="Soft green glass forms inspired by mindful living">
          <div className="auth-art-caption"><span>MADE WITH INTENTION</span><span>01 / 01</span></div>
          <div className="auth-art-scene" aria-hidden="true"><div className="auth-art-halo"/><div className="auth-liquid-loop auth-loop-one"/><div className="auth-liquid-loop auth-loop-two"/><div className="auth-liquid-sphere auth-sphere-one"/><div className="auth-liquid-sphere auth-sphere-two"/><div className="auth-liquid-sphere auth-sphere-three"/><div className="auth-art-light"/></div>
          <div className="auth-art-note"><span className="auth-art-leaf">✳</span><div><b>Small steps. A steadier flow.</b><span>A clear space for thoughtful work.</span></div></div>
        </aside>
      </div>
    </main>
  );
}
