import { signInWithGoogle } from './actions';
import { hasSupabaseConfig } from '../../lib/supabase/server';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ setup?: string; error?: string }> }) {
  const params = await searchParams;
  const setupMissing = params.setup === 'missing';
  const supabaseConfigured = hasSupabaseConfig();
  return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span>✳</span> SATVIC STUDIO</div><div className="auth-orb">S</div><p className="auth-kicker">DUBBING QUALITY WORKSPACE</p><h1>Your QA history,<br/><em>always with you.</em></h1><p className="auth-copy">Sign in to upload videos, follow dubbing jobs, and revisit private QA reports from any device.</p>{!supabaseConfigured || setupMissing ? <div className="auth-error">Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>, then restart the dev server.</div> : params.error ? <div className="auth-error">Google sign-in did not complete. Check the Supabase Google provider and redirect URL settings.</div> : null}<form action={signInWithGoogle}><button className="google-signin" type="submit" disabled={!supabaseConfigured}><span className="google-g">G</span> {supabaseConfigured ? 'Continue with Google' : 'Add Supabase keys to continue'} <span>→</span></button></form><div className="auth-privacy">Private to your account <i/> Videos and reports stay in your workspace</div></section><div className="auth-ambient auth-ambient-one"/><div className="auth-ambient auth-ambient-two"/></main>;
}
