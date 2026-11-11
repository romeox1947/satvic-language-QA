'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, CircleDot, Plus, Target } from 'lucide-react';
import ProductDashboardShell from '@/features/dashboard/client/ProductDashboardShell';

const priorities = [
  { title: 'Prepare the Satvic Flute pilot', owner: 'Piyush', due: 'This week', status: 'In progress' },
  { title: 'Choose the first launch partners', owner: 'Partnerships', due: 'Nov 18', status: 'Needs a decision' },
  { title: 'Review the product onboarding flow', owner: 'Product', due: 'Nov 21', status: 'Planned' },
];

const sections: Record<string, { title: string; description: string }> = {
  priorities: { title: 'Priorities', description: 'The work the team is moving forward now.' },
  decisions: { title: 'Decisions', description: 'Questions that need a clear owner and outcome.' },
  'meeting-notes': { title: 'Meeting notes', description: 'A place to capture the context and next steps from conversations.' },
  roadmap: { title: 'Roadmap', description: 'Milestones for the next stage of the company.' },
};

export default function FounderOfficeDashboard({ accountEmail = '' }: { accountEmail?: string }) {
  const [activeFeature, setActiveFeature] = useState('founder-overview');
  const [notice, setNotice] = useState('');
  const isOverview = activeFeature === 'founder-overview';
  const page = sections[activeFeature];

  return (
    <ProductDashboardShell
      productId="founder-office"
      accountEmail={accountEmail}
      onNotice={setNotice}
      initialFeatureId="founder-overview"
      onFeatureSelect={setActiveFeature}
    >
      <section className="welcome-row founder-welcome"><div><div className="eyebrow"><span className="eyebrow-line" /> FOUNDER OFFICE · STARTER WORKSPACE</div><h1>{isOverview ? 'Founder Office' : page?.title}</h1><p className="welcome-subtitle">{isOverview ? 'A clear place for priorities, decisions, meeting notes, and plans.' : page?.description}</p></div><button className="primary-btn" onClick={() => setNotice('Priority creation is a starter action. Connect this workspace to your company data when ready.')}><Plus size={17} /> Add a priority</button></section>

      <div className="founder-sample-note"><CircleDot size={15} /><span>Starter workspace with sample items. Replace these examples with your own operating plan.</span></div>

      {isOverview ? <>
        <section className="founder-summary" aria-label="Founder Office summary">
          <article className="founder-summary-card"><span>ACTIVE PRIORITIES</span><b>03</b><small>Across product and launch</small></article>
          <article className="founder-summary-card"><span>DECISIONS TO MAKE</span><b>02</b><small>Launch partners and pilot scope</small></article>
          <article className="founder-summary-card"><span>NEXT CHECK-IN</span><b>Friday</b><small>Weekly operating review</small></article>
        </section>
        <section className="founder-panel panel">
          <div className="panel-heading"><div><div className="section-kicker">THIS WEEK</div><h3>Current priorities</h3></div><button className="text-action" onClick={() => setActiveFeature('priorities')}>All priorities <ArrowRight size={14}/></button></div>
          <div className="founder-priority-list">{priorities.map((item,index) => <article className="founder-priority" key={item.title}><span className="founder-priority-number">0{index+1}</span><div><b>{item.title}</b><small>{item.owner} <span>·</span> Due {item.due}</small></div><span className="founder-status"><i/>{item.status}</span></article>)}</div>
        </section>
        <section className="founder-lower-grid">
          <article className="founder-panel panel"><div className="section-kicker">OPEN DECISION</div><h3>Which partners join the first pilot?</h3><p>Compare launch readiness, audience fit, and capacity before confirming the first group.</p><button className="founder-inline-action" onClick={() => setActiveFeature('decisions')}>Review decision <ArrowRight size={14}/></button></article>
          <article className="founder-panel panel"><div className="section-kicker">UPCOMING MILESTONE</div><h3><CalendarDays size={17}/> Satvic Flute pilot</h3><p>Confirm partners, finish onboarding, and prepare the first language QA projects.</p><button className="founder-inline-action" onClick={() => setActiveFeature('roadmap')}>Open roadmap <ArrowRight size={14}/></button></article>
        </section>
      </> : <section className="founder-panel panel founder-detail-panel">
        <div className="panel-heading"><div><div className="section-kicker">SAMPLE CONTENT</div><h3>{page?.title}</h3></div></div>
        {activeFeature === 'priorities' && <div className="founder-priority-list">{priorities.map((item,index) => <article className="founder-priority" key={item.title}><span className="founder-priority-number">0{index+1}</span><div><b>{item.title}</b><small>{item.owner} <span>·</span> Due {item.due}</small></div><span className="founder-status"><i/>{item.status}</span></article>)}</div>}
        {activeFeature === 'decisions' && <div className="founder-detail-copy"><h4>Which partners join the first pilot?</h4><p>Owner: Piyush · Target date: Nov 18</p><p>Compare launch readiness, audience fit, and capacity before confirming the first group.</p><button className="founder-inline-action" onClick={() => setNotice('Decision marked for the next weekly operating review.')}><Check size={15}/> Mark for review</button></div>}
        {activeFeature === 'meeting-notes' && <div className="founder-detail-copy"><h4>Weekly operating review</h4><p>Sample note · Nov 11</p><ul><li>Finalize the first Satvic Flute pilot partners.</li><li>Walk through the onboarding and QA review flow.</li><li>Assign owners for launch readiness tasks.</li></ul><button className="founder-inline-action" onClick={() => setNotice('Meeting note creation is a starter action.')}><Plus size={15}/> Add a note</button></div>}
        {activeFeature === 'roadmap' && <div className="founder-priority-list">{['Pilot onboarding', 'First partner launch', 'Review pilot feedback'].map((item,index) => <article className="founder-priority" key={item}><span className="founder-priority-number">0{index+1}</span><div><b>{item}</b><small>{index === 0 ? 'November' : index === 1 ? 'December' : 'After launch'}</small></div><Target size={17} className="founder-roadmap-icon"/></article>)}</div>}
      </section>}

      {notice && <div className="toast"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
    </ProductDashboardShell>
  );
}
