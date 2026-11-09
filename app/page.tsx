import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownRight, ArrowRight, AudioLines, Check, CirclePlay, Languages, ShieldCheck, Sparkles, Waves } from 'lucide-react';

function BrandMark() {
  return <span className="landing-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  // If Supabase's Site URL fallback sends OAuth directly to `/`, finish the
  // one-time code exchange through the same callback route as normal sign-in.
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" href="/" aria-label="Satvic Studio home"><BrandMark /><span>satvic studio<small>DUB QA WORKSPACE</small></span></Link>
        <nav aria-label="Main navigation"><Link className="landing-nav-login" href="/login">Log in</Link><Link className="landing-nav-cta" href="/signup">Create account <ArrowRight size={15} /></Link></nav>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-eyebrow"><span /> MULTILINGUAL VIDEO QA</div>
          <h1>Know where to listen<br />when you <em>don’t speak</em><br />the language.</h1>
          <p>Compare the original and dubbed audio. Satvic Studio points to moments that may need a fluent speaker’s review.</p>
          <div className="landing-actions"><Link className="landing-primary" href="/signup">Get started <ArrowRight size={16} /></Link><Link className="landing-secondary" href="/login">I already have an account <ArrowDownRight size={15} /></Link></div>
          <div className="landing-trust"><ShieldCheck size={15} /><span>Your review stays yours. Sign in with Google to save your projects.</span></div>
        </div>
        <div className="landing-visual" aria-label="Illustration of original and dubbed tracks being reviewed">
          <div className="visual-orbit visual-orbit-a" /><div className="visual-orbit visual-orbit-b" />
          <div className="visual-card">
            <div className="visual-card-head"><div><span className="visual-overline">QA PROJECT</span><b>Hindi to Marathi review</b></div><span className="visual-status"><i /> READY</span></div>
            <div className="visual-track"><div className="visual-language">HI</div><div className="visual-track-text"><b>Hindi original</b><span>Source audio</span></div><div className="visual-wave" aria-hidden="true">{[16,28,21,37,24,43,29,17,35,25,42,19,31,23].map((height, i) => <i key={i} style={{ height }} />)}</div><span className="visual-play"><CirclePlay size={20} /></span></div>
            <div className="visual-connector"><span /><span>COMPARE BOTH AUDIO TRACKS</span><span /></div>
            <div className="visual-track"><div className="visual-language visual-language-target">MR</div><div className="visual-track-text"><b>Marathi dub</b><span>Target audio</span></div><div className="visual-wave visual-wave-target" aria-hidden="true">{[29,18,38,22,44,26,34,19,41,25,36,20,31,16].map((height, i) => <i key={i} style={{ height }} />)}</div><span className="visual-play"><CirclePlay size={20} /></span></div>
            <div className="visual-finding"><span className="visual-finding-icon"><AudioLines size={16} /></span><div><b>Moment to review</b><span>Open the source and dub at the same time</span></div><strong>00:26</strong></div>
          </div>
          <div className="visual-float visual-float-top"><Languages size={15} /><span>Many language pairs</span></div><div className="visual-float visual-float-bottom"><Check size={15} /><span>Human review stays in the loop</span></div>
          <div className="landing-visual-caption"><Waves size={13} /> AUDIO FIRST <span /> TRANSCRIPTS AS EVIDENCE</div>
        </div>
      </section>
      <section className="landing-how" aria-labelledby="how-title">
        <div className="landing-section-heading"><span>HOW IT WORKS</span><h2 id="how-title">A clearer path from dub to review.</h2><p>Use a dub you already have, or start with Sarvam. Then focus on the moments that need attention.</p></div>
        <div className="landing-steps">
          <article><span className="landing-step-no">01</span><div className="landing-step-icon"><Languages size={19} /></div><h3>Choose your tracks</h3><p>Upload the original and the dub, or create a dub with Sarvam.</p></article>
          <article><span className="landing-step-no">02</span><div className="landing-step-icon"><AudioLines size={19} /></div><h3>Compare the audio</h3><p>AI reviews both audio tracks. Transcripts add context to the review.</p></article>
          <article><span className="landing-step-no">03</span><div className="landing-step-icon"><Sparkles size={19} /></div><h3>Listen at the moment</h3><p>Open paired time ranges and ask a fluent speaker to confirm possible issues.</p></article>
        </div>
      </section>
      <section className="landing-note"><span><ShieldCheck size={18} /></span><p><b>AI helps direct the review; it does not certify a translation.</b><br />A fluent speaker should confirm meaning, pronunciation, and delivery before publishing.</p><Link href="/signup">Start reviewing <ArrowRight size={15} /></Link></section>
      <footer className="landing-footer"><Link className="landing-brand landing-brand-footer" href="/"><BrandMark /><span>satvic studio<small>DUB QA WORKSPACE</small></span></Link><span>Built for thoughtful multilingual video review.</span><Link href="/login">Log in <ArrowRight size={13} /></Link></footer>
    </main>
  );
}
