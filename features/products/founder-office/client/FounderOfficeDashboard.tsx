'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import ProductDashboardShell from '@/features/dashboard/client/ProductDashboardShell';

const modules = {
  overview: { title: 'Overview', description: 'A connected workspace for capturing ideas, making decisions, and moving work forward.', cards: [['Founder Mind', 'Capture thoughts and decide what deserves further exploration.'], ['Ideas to execution', 'Research opportunities, approve a plan, then track projects and milestones.'], ['Team knowledge', 'Connect people, meeting decisions, founder communications, and organisational memory.']] },
  'founder-mind': { title: 'Founder Mind', description: 'A second brain for ideas, problems, voice notes, documents, and links.', cards: [['Capture anything', 'Save a thought from a meeting or whenever it comes to mind.'], ['AI understanding', 'Organise captured thoughts by topic, objective, and what needs to be learned.'], ['You stay in control', 'Choose whether to explore, save, reject, or turn an idea into work.']] },
  ideas: { title: 'Ideas & Opportunities', description: 'Shape an approved thought into a project the team can review.', cards: [['Problem & objective', 'Clarify the need, audience, scope, and intended outcome.'], ['Research & feasibility', 'Review evidence, costs, operational needs, and assumptions.'], ['Plan for approval', 'Draft milestones, timeline, owners, budget, and success measures.']] },
  projects: { title: 'Project Execution', description: 'Turn approved plans into milestones, owners, and trackable work.', cards: [['Active projects', 'Approved ideas and initiatives move here for execution.'], ['Milestones & tasks', 'Keep deliverables, dependencies, owners, and dates together.'], ['Blockers', 'Surface delays early and suggest practical next steps.']] },
  people: { title: 'People & Resources', description: 'Find the right skills and capacity for each initiative.', cards: [['Team directory', 'Keep teams, skills, and areas of expertise discoverable.'], ['Project capacity', 'See current assignments and identify overloaded teams.'], ['Suggested collaborators', 'Get recommendations for review by the relevant manager.']] },
  meetings: { title: 'Meetings & Discussions', description: 'Keep meeting outcomes connected to the work they affect.', cards: [['Meeting notes', 'Capture or import a discussion and its context.'], ['Decisions & actions', 'Record decisions, owners, deadlines, and open questions.'], ['Follow through', 'Connect agreed actions to existing projects for tracking.']] },
  voice: { title: 'Founder Voice', description: 'Draft communications in a founder’s style for review before sending.', cards: [['Writing examples', 'Use approved emails, announcements, and messages as references.'], ['Draft a message', 'Prepare team updates, replies, and workshop or product copy.'], ['Review before sending', 'Every draft stays editable and requires founder approval.']] },
  memory: { title: 'Organisational Memory', description: 'Keep the reasoning behind important decisions easy to find.', cards: [['Past decisions', 'Search what was discussed, decided, and when.'], ['Reasoning & sources', 'Preserve the evidence and context behind each decision.'], ['What changed?', 'Revisit earlier choices when new information becomes available.']] },
} as const;

type ModuleId = keyof typeof modules;

export default function FounderOfficeDashboard({ accountEmail = '' }: { accountEmail?: string }) {
  const [activeFeature, setActiveFeature] = useState<ModuleId>('overview');
  const [thought, setThought] = useState('');
  const [savedThoughts, setSavedThoughts] = useState<string[]>([]);
  const current = modules[activeFeature];

  function saveThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = thought.trim();
    if (!value) return;
    setSavedThoughts(items => [value, ...items]);
    setThought('');
  }

  return (
    <ProductDashboardShell productId="founder-office" accountEmail={accountEmail} onNotice={() => {}}
      initialFeatureId="overview" onFeatureSelect={id => { if (id in modules) setActiveFeature(id as ModuleId); }}>
      <section className="welcome-row founder-welcome">
        <div><h1>{current.title}</h1><p className="welcome-subtitle">{current.description}</p></div>
      </section>
      {activeFeature === 'founder-mind' && <form className="founder-capture panel" onSubmit={saveThought}>
        <label htmlFor="founder-thought">What’s on your mind?</label>
        <p>An idea, problem, or something you want the team to explore.</p>
        <textarea id="founder-thought" value={thought} onChange={event => setThought(event.target.value)} placeholder="Capture a thought…" rows={3} />
        <button className="primary-btn" type="submit"><Plus size={16} /> Capture thought</button>
      </form>}
      {savedThoughts.length > 0 && activeFeature === 'founder-mind' && <section className="founder-panel panel"><div className="panel-heading"><h3>Captured thoughts</h3></div>{savedThoughts.map((item, index) => <article className="founder-priority" key={`${index}-${item}`}><div><b>{item}</b><small>New thought · Needs your review</small></div><span className="founder-status">Saved</span></article>)}</section>}
      <section className="founder-module-grid" aria-label={`${current.title} capabilities`}>
        {current.cards.map(([title, description]) => <article className="founder-module-card panel" key={title}><span className="section-kicker">{current.title.toUpperCase()}</span><h3>{title}</h3><p>{description}</p><span className="founder-module-link">Part of one connected workflow <ArrowRight size={14} /></span></article>)}
      </section>
    </ProductDashboardShell>
  );
}
