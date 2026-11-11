'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Menu } from 'lucide-react';
import Link from 'next/link';

const links = [
  ['The concept', '#concept'],
  ['Livestock emissions card', '#satvic-rewards-card'],
  ['Our impact', '#impact'],
  ['Partnerships', '#partnerships'],
];

function Brand() {
  return <a className="brand wordmark" href="#top" aria-label="Satvic Studio home">satvic studio</a>;
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header className={`nav${scrolled ? ' nav-scrolled' : ''}`}>
      <div className="nav-inner">
        <Brand />
        <nav className="nav-links" aria-label="Main navigation">
          {links.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
        </nav>
        <div className="nav-actions">
          <Link className="nav-cta" href="/signup">Signup</Link>
          <Link className="nav-secondary" href="/login">Login</Link>
        </div>
        <details className="mobile-nav">
          <summary aria-label="Open navigation"><Menu /></summary>
          <nav className="mobile-nav-panel" aria-label="Mobile navigation">
            {links.map(([label, href]) => <a key={label} href={href}>{label}<ArrowRight size={14} /></a>)}
            <Link href="/signup">Signup<ArrowUpRight size={14} /></Link>
            <Link href="/login">Login<ArrowUpRight size={14} /></Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
