import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
            <Link href="/" className="auth-back-link"><ArrowLeft size={15}/>Back to website</Link>
            <span className="auth-v2-brand"><img src="https://satvicmovement.org/images/favicon.png" alt=""/><span>Satvic Studio</span></span>
          </header>
          <div className="auth-v2-content">
            <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="auth-v2-copy">{isSignup ? 'Sign up with Google. Add your name and role next.' : 'Sign in with Google to continue.'}</p>
            {setupError ? <div className="auth-error">{setup === 'profile-table' ? <>The profiles table is not ready yet. Run the updated <code>supabase/schema.sql</code> in the Supabase SQL editor.</> : <>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to your environment, then redeploy.</>}</div> : error ? <div className="auth-error">Google sign-in did not complete. Start a fresh sign-in and check the Supabase redirect settings if it happens again.</div> : null}
            <form action={signInWithGoogle} className="auth-v2-form"><button className="auth-v2-google" type="submit" disabled={!configured}><span className="auth-v2-google-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.2l6.3 4.9c3.7-3.4 6.4-8.4 6.4-14.8z"/><path fill="#34A853" d="M24 44c5.4 0 10-1.8 13.3-4.8L31 34.3c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.5l-6.5 5C9.4 39.3 16.1 44 24 44z"/><path fill="#FBBC05" d="M12.6 27.8a12 12 0 0 1 0-7.6l-6.5-5a20 20 0 0 0 0 17.6z"/><path fill="#EA4335" d="M24 11.7c3 0 5.6 1 7.7 3.1l5.8-5.8C34 5.6 29.4 4 24 4 16.1 4 9.4 8.7 6.1 15.2l6.5 5c1.6-4.9 6.1-8.5 11.4-8.5z"/></svg></span><span>{configured ? (isSignup ? 'Sign up with Google' : 'Continue with Google') : 'Configure Supabase to continue'}</span></button></form>
            <div className="auth-v2-switch">{isSignup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New to Satvic Studio? <Link href="/signup">Create an account</Link></>}</div>
          </div>
        </section>
        <aside className="auth-art-panel" aria-label="Soft green glass forms inspired by mindful living">
          <div className="auth-art-scene" aria-hidden="true"><div className="auth-art-halo"/><div className="auth-liquid-loop auth-loop-one"/><div className="auth-liquid-loop auth-loop-two"/><div className="auth-liquid-sphere auth-sphere-one"/><div className="auth-liquid-sphere auth-sphere-two"/><div className="auth-liquid-sphere auth-sphere-three"/><div className="auth-art-light"/></div>
        </aside>
      </div>
    </main>
  );
}
