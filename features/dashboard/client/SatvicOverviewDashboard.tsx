'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Bell, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Leaf, LogOut, Search, Settings, Sparkles, Sprout, Utensils,
} from 'lucide-react';
import { signOut } from '@/features/auth/server/actions';

const navItems = ['Overview', 'Analytics', 'Community', 'Programs'];
const weeklyBars = [44, 58, 36, 66, 91, 53, 73];

export default function SatvicOverviewDashboard({ accountName, accountEmail }: { accountName: string; accountEmail: string }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [period, setPeriod] = useState('Month');
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const monthDate = new Date(2026, 5 + monthOffset, 1);
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(monthDate);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const mondayOffset = (monthDate.getDay() + 6) % 7;
  const calendarDays = Array.from({ length: Math.ceil((mondayOffset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - mondayOffset + 1;
    if (day < 1) return { day: new Date(monthDate.getFullYear(), monthDate.getMonth(), 0).getDate() + day, outside: true };
    if (day > daysInMonth) return { day: day - daysInMonth, outside: true };
    return { day, outside: false };
  });
  const initials = accountName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();

  return <main className="satvic-overview-page">
    <div className="satvic-overview-frame">
      <header className="so-header">
        <Link className="so-brand" href="/" aria-label="Satvic Studio home">
          <span className="so-brand-mark"><img src="https://satvicmovement.org/images/favicon.png" alt="" /></span>
          <span className="so-brand-copy"><b>Satvic Studio</b><small>STUDIO OVERVIEW</small></span>
        </Link>
        <nav className="so-tabs" aria-label="Dashboard sections">{navItems.map(item => <button key={item} type="button" className={activeTab === item ? 'active' : ''} onClick={() => setActiveTab(item)}>{item}</button>)}<Link className="so-tools-link" href="/dashboard/satvic-fluid">Tools</Link></nav>
        <div className="so-header-actions">
          {searchOpen && <input className="so-search-input" autoFocus aria-label="Search dashboard" placeholder="Search dashboard" onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); }} />}
          <button className={`so-icon-button${searchOpen ? ' so-icon-active' : ''}`} type="button" aria-label="Search" onClick={() => setSearchOpen(open => !open)}><Search size={18} /></button>
          <button className="so-icon-button so-bell" type="button" aria-label="Notifications" onClick={() => window.alert('You are all caught up.') }><Bell size={18}/><i /></button>
          <div className="so-account-wrap">
            <button type="button" className="so-account-button" aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>
              <span className="so-avatar">{initials}</span><span className="so-account-copy"><b>{accountName}</b><small>{accountEmail || 'Satvic Studio account'}</small></span><ChevronDown size={15}/>
            </button>
            {accountOpen && <div className="so-account-menu"><div className="so-menu-identity"><b>{accountName}</b><span>{accountEmail}</span></div><button type="button" onClick={() => window.alert('Account settings are coming soon.')}><Settings size={15}/>Account settings</button><button type="button" onClick={() => window.alert('Help is coming soon.')}><CircleHelp size={15}/>Help center</button><form action={signOut}><button type="submit"><LogOut size={15}/>Sign out</button></form></div>}
          </div>
        </div>
      </header>

      <section className="so-top-grid">
        <article className="so-card so-impact-card">
          <div className="so-card-heading"><div><span className="so-card-kicker">COMMUNITY IMPACT</span><h2>Movement reach</h2></div><button className="so-round-action" type="button" aria-label="Open movement reach details"><ArrowUpRight size={17}/></button></div>
          <div className="so-impact-main"><div className="so-impact-stat"><strong>79,675</strong><span className="so-trend"><ArrowUpRight size={13}/> 12.4%</span><small>people reached this month</small></div><div className="so-impact-stat so-impact-secondary"><strong>312</strong><span className="so-trend"><ArrowUpRight size={13}/> 4.7%</span><small>daily community joins</small></div></div>
          <div className="so-reach-visual"><div className="so-chart-legend"><span><i className="legend-purple"/> Community reach <b>48.2k</b></span><span><i className="legend-gold"/> Program interest <b>31.4k</b></span></div><svg className="so-line-chart" viewBox="0 0 620 176" preserveAspectRatio="none" role="img" aria-label="Community reach and program interest trending up through the month"><defs><linearGradient id="reach-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9a78c4" stopOpacity=".16"/><stop offset="1" stopColor="#9a78c4" stopOpacity="0"/></linearGradient></defs><path className="so-chart-fill" d="M0 126 C35 119 44 89 74 91 S116 129 152 110 S190 72 224 88 S258 140 298 113 S349 100 381 79 S430 92 457 84 S506 50 535 63 S582 41 620 30 V176 H0Z"/><path className="so-chart-line so-chart-line-purple" d="M0 126 C35 119 44 89 74 91 S116 129 152 110 S190 72 224 88 S258 140 298 113 S349 100 381 79 S430 92 457 84 S506 50 535 63 S582 41 620 30"/><path className="so-chart-line so-chart-line-gold" d="M0 109 C34 141 56 130 79 119 S124 88 150 107 S197 133 227 111 S270 87 298 98 S344 129 372 105 S424 77 452 97 S495 117 522 82 S575 84 620 57"/><line x1="381" x2="381" y1="21" y2="176" className="so-chart-marker"/><circle cx="381" cy="79" r="5" className="so-chart-dot"/></svg><div className="so-chart-axis"><span>1 Jun</span><span>6 Jun</span><span>11 Jun</span><span>16 Jun</span><span>21 Jun</span><span>26 Jun</span><span>30 Jun</span></div></div>
          <div className="so-card-footer"><span><Sparkles size={14}/> The community is growing steadily this month.</span><button type="button" onClick={() => setActiveTab('Analytics')}>View report <ArrowUpRight size={14}/></button></div>
        </article>

        <article className="so-card so-calendar-card">
          <div className="so-card-heading"><div><span className="so-card-kicker">WHAT'S HAPPENING</span><h2>Community calendar</h2></div><div className="so-month-arrows"><button type="button" aria-label="Previous month" onClick={() => setMonthOffset(offset => offset - 1)}><ChevronLeft size={16}/></button><button type="button" aria-label="Next month" onClick={() => setMonthOffset(offset => offset + 1)}><ChevronRight size={16}/></button></div></div>
          <div className="so-calendar-month">{monthLabel}<ChevronDown size={14}/></div><div className="so-calendar-grid">{['M','T','W','T','F','S','S'].map((day, i) => <span className="so-day-name" key={`${day}-${i}`}>{day}</span>)}{calendarDays.map(({ day, outside }, i) => <button type="button" key={`${i}-${day}`} className={`${outside ? 'so-outside' : ''} ${!outside && monthOffset === 0 && [10,11,12,13,14].includes(day) ? 'so-event-day' : ''} ${!outside && monthOffset === 0 && day === 16 ? 'so-today' : ''}`} aria-label={`${day} ${monthLabel}`}>{day}{!outside && [4,9,18,25].includes(day) && <i/>}</button>)}</div>
          <div className="so-calendar-feature"><span className="so-feature-icon"><Sprout size={20}/></span><div><small>NEXT COMMUNITY SESSION</small><b>Eat well, live well</b><span>Saturday, June 20 · 11:00 AM</span></div><button type="button" aria-label="See session details"><ArrowUpRight size={16}/></button></div>
        </article>

        <article className="so-card so-program-card">
          <div className="so-card-heading"><div><span className="so-card-kicker">PROGRAM PARTICIPATION</span><h2>People learning together</h2></div><button className="so-more-button" type="button">This week <ChevronDown size={14}/></button></div>
          <div className="so-program-overview"><strong>4,365</strong><span>active participants</span><div className="so-program-chips"><span><i className="so-lilac-dot"/> Wellbeing <b>2,876</b></span><span><i className="so-saffron-dot"/> Food &amp; health <b>1,489</b></span></div></div>
          <div className="so-week-bars">{weeklyBars.map((height, i) => <div className="so-bar-group" key={i}><div className="so-bar-value" style={{height:`${height}%`}}><span>{[0,1,2,3,4,5,6][i] === 4 ? '562' : ''}</span></div><div className="so-bar-base" style={{height:`${Math.max(17,height * .52)}%`}}/><small>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</small></div>)}</div>
          <div className="so-program-note"><Utensils size={14}/> Plant-forward living is the most explored topic this week.</div>
        </article>
      </section>

      <section className="so-bottom-grid">
        <article className="so-card so-content-card"><div className="so-card-heading"><div><span className="so-card-kicker">COMMUNITY FAVOURITES</span><h2>Popular this week</h2></div><button type="button" className="so-text-action" onClick={() => setActiveTab('Community')}>See all <ArrowUpRight size={14}/></button></div><div className="so-content-list">
          <div className="so-content-row"><span className="so-content-thumb thumb-green"><Leaf size={20}/></span><span className="so-content-copy"><b>A gentle morning reset</b><small>Daily practice <i>·</i> 8 min</small></span><strong>39k</strong></div>
          <div className="so-content-row"><span className="so-content-thumb thumb-peach"><Utensils size={19}/></span><span className="so-content-copy"><b>Simple sattvic meals</b><small>Food &amp; wellness <i>·</i> 12 min</small></span><strong>31k</strong></div>
          <div className="so-content-row"><span className="so-content-thumb thumb-lilac"><Sparkles size={19}/></span><span className="so-content-copy"><b>Find your calm, naturally</b><small>Mindful living <i>·</i> 6 min</small></span><strong>27k</strong></div>
        </div></article>

        <article className="so-card so-community-card"><div className="so-card-heading"><div><span className="so-card-kicker">COMMUNITY SNAPSHOT</span><h2>Growing with intention</h2></div><button className="so-round-action" type="button" aria-label="Community snapshot details"><ArrowUpRight size={17}/></button></div><div className="so-donut-wrap"><div className="so-donut"><div><strong>46%</strong><span>joined this month</span></div></div><div className="so-donut-bubble bubble-top"><strong>18%</strong><span>returning</span></div><div className="so-donut-bubble bubble-side"><strong>4%</strong><span>shared</span></div><div className="so-donut-bubble bubble-bottom"><strong>32%</strong><span>new learners</span></div></div><div className="so-dot-legend"><span><i className="legend-purple"/> New learners</span><span><i className="legend-gold"/> Returning</span><span><i className="legend-green"/> Shared</span></div></article>

        <article className="so-card so-global-card"><div className="so-card-heading"><div><span className="so-card-kicker">A MOVEMENT WITHOUT BORDERS</span><h2>Satvic, everywhere</h2></div><button className="so-text-action" type="button" onClick={() => setActiveTab('Community')}>See all <ArrowUpRight size={14}/></button></div><div className="so-global-content"><div className="so-world-map" aria-label="Decorative dotted world map"><svg viewBox="0 0 550 260" role="img" aria-hidden="true"><defs><pattern id="map-dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.45" fill="#9d83bd"/></pattern></defs><path fill="url(#map-dots)" d="M33 69l19-19 30-8 15-13 32 4 17 17-9 16 17 8 2 15-22 9-11 22-14 5-11 28-15-5-3-24-15-8-9-18-21-3-9-13-18-3zm106 81l16 4 14 18-6 19-11 9-4 22-12-6-3-25-11-14 4-18zm91-128l20-17 38 3 17 13 31 0 18 14-4 16-19 6-10 14-16 3-6 20-18 5-9-13-19-5-12-19-21-1-14-16zm77 82l21-8 19 10 15 18-10 18-17 8-9 28-16 21-16-4-11-22-1-21-12-13 4-21zm81-77l35-14 45 8 28 17-7 15-32 6-11 17-25 4-17 17-14-7 5-19-14-14-18-5zm39 95l20-4 12 11 0 15-14 6-12-10z"/></svg><div className="so-map-pulse pulse-one"/><div className="so-map-pulse pulse-two"/><div className="so-map-pulse pulse-three"/></div><div className="so-country-list"><div className="so-global-total"><strong>231,841</strong><span>community views worldwide</span></div>{[['🇮🇳','India','83,420'],['🇺🇸','United States','43,987'],['🇬🇧','United Kingdom','32,648'],['🇦🇺','Australia','26,563'],['🇨🇦','Canada','21,514']].map(([flag,country,count]) => <div className="so-country-row" key={country}><span>{flag}</span><b>{country}</b><strong>{count}</strong></div>)}</div></div></article>
      </section>
      <footer className="so-footer"><span><img src="https://satvicmovement.org/images/favicon.png" alt=""/> Made with care, for a more mindful world.</span><span>DEMO DATA <i/> UPDATED JUST NOW</span></footer>
    </div>
  </main>;
}
