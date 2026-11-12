'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Brain, Plus, Send } from 'lucide-react';
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
  const [messages, setMessages] = useState<{ role: 'founder' | 'assistant'; text: string }[]>([]);
  const current = modules[activeFeature];

  function sendThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = thought.trim();
    if (!value) return;
    setMessages(items => [...items, { role: 'founder', text: value }, { role: 'assistant', text: 'Captured for this conversation. You can choose to explore it, keep it as a thought, or turn it into a project.' }]);
    setThought('');
  }

  return (
    <ProductDashboardShell productId="founder-office" accountEmail={accountEmail} onNotice={() => {}}
      initialFeatureId="overview" onFeatureSelect={id => { if (id in modules) setActiveFeature(id as ModuleId); }}>
      {activeFeature === 'founder-mind' ? <section className="founder-mind-stage" aria-label="Founder Mind chat">
        <aside className="founder-chat-history"><button type="button" className="founder-new-chat" onClick={() => setMessages([])}><Plus size={16} /> New chat</button><span className="section-kicker">HISTORY</span>{messages.filter(message => message.role === 'founder').map((message, index) => <div className="founder-history-item" key={`${index}-${message.text}`}>{message.text}</div>)}</aside>
        <div className="founder-chat-main"><header className="founder-chat-heading"><div><h1>Founder Mind</h1><p>{current.description}</p></div></header>
          <div className="founder-chat-messages">{messages.length === 0 ? <div className="founder-chat-empty"><span className="founder-chat-mark"><Brain size={22} /></span><h2>Think it through.</h2><p>Share an idea, a problem, or a note from a meeting. You choose what happens to it next.</p></div> : messages.map((message, index) => <article className={`founder-chat-message ${message.role}`} key={`${index}-${message.text}`}><span>{message.role === 'founder' ? 'You' : 'Founder Mind'}</span><p>{message.text}</p></article>)}</div>
          <form className="founder-chat-composer" onSubmit={sendThought}><textarea aria-label="Message Founder Mind" value={thought} onChange={event => setThought(event.target.value)} placeholder="Share a thought, idea, or problem…" rows={1} /><div className="founder-composer-footer"><span>Your ideas stay yours. Nothing becomes a project without your approval.</span><button type="submit" aria-label="Send message" disabled={!thought.trim()}><Send size={17} /></button></div></form>
        </div>
      </section> : <><section className="welcome-row founder-welcome"><div><h1>{current.title}</h1><p className="welcome-subtitle">{current.description}</p></div></section><section className="founder-module-grid" aria-label={`${current.title} capabilities`}>
        {current.cards.map(([title, description]) => <article className="founder-module-card panel" key={title}><span className="section-kicker">{current.title.toUpperCase()}</span><h3>{title}</h3><p>{description}</p><span className="founder-module-link">Part of one connected workflow <ArrowRight size={14} /></span></article>)}
      </section></>}
    </ProductDashboardShell>
  );
}
