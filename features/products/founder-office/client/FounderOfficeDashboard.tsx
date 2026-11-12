'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Brain, Check, ChevronRight, Plus, Send, X } from 'lucide-react';
import ProductDashboardShell from '@/features/dashboard/client/ProductDashboardShell';
import FounderPromptBar from './FounderPromptBar';
import ThoughtLine from './ThoughtLine';

const featureInfo = {
  overview: { title: 'Overview', description: 'A connected view of ideas, decisions, and work moving across Founder Office.' },
  'founder-mind': { title: 'Founder Mind', description: 'Capture a thought. Founder Office will suggest where it belongs.' },
  voice: { title: 'Founder Voice', description: 'Draft founder communications and keep approval with the founder.' },
  meetings: { title: 'Meetings & Discussions', description: 'Turn meeting notes into decisions, owners, and follow-up jobs.' },
  people: { title: 'People & Resources', description: 'Find the right people and capacity for approved work.' },
  ideas: { title: 'Ideas & Opportunities', description: 'Explore and validate ideas before turning them into projects.' },
  projects: { title: 'Project Execution', description: 'Track approved plans through milestones, owners, and delivery.' },
  memory: { title: 'Organisational Memory', description: 'Keep decisions, evidence, and outcomes connected for future reference.' },
} as const;
type FeatureId = keyof typeof featureInfo;
type JobStatus = 'captured' | 'understood' | 'in-progress' | 'done';
type Job = { id: string; title: string; source: string; feature: FeatureId; status: JobStatus; due: string; plan: string[] };
type FounderMessage = { id: string; role: 'user' | 'assistant'; text: string; job?: Job };
type EmailDraft = { to: string; subject: string; body: string; status: 'Draft Done' | 'Ready for review' };
type VoiceDraftEntry = { id: string; title: string; content: string; saved: boolean };
type VoicePanelId = 'announcement' | 'workshop' | 'applicant' | 'product' | 'community' | 'internal';
const voicePanelCatalog: Record<VoicePanelId, { title: string; placeholder: string; content: string }> = {
  announcement: { title: 'Team announcements', placeholder: 'Write an update for the team...', content: 'Team, we are preparing the next Satvic community initiative. I will share the plan and owners after our review.' },
  workshop: { title: 'Workshop descriptions', placeholder: 'Describe the workshop...', content: 'Join us for a practical, three-day Satvic cooking experience. Learn simple techniques, prepare nourishing meals, and bring the practice into your daily routine.' },
  applicant: { title: 'Applicant replies', placeholder: 'Draft a reply to an applicant...', content: '' },
  product: { title: 'Product descriptions', placeholder: 'Describe the product...', content: '' },
  community: { title: 'Community messages', placeholder: 'Write a community message...', content: '' },
  internal: { title: 'Important internal communications', placeholder: 'Draft an internal communication...', content: '' },
};

const demoJobs: Job[] = [
  { id: 'guide', title: 'Build a Satvic Movement Community Guide', source: 'We need to build a Satvic Movement Community Guide in 30 days.', feature: 'projects', status: 'understood', due: '30 days', plan: ['Define guide scope and target audience', 'Collect and verify community locations', 'Design and build the guide', 'Review and launch within 30 days'] },
  { id: 'workshop', title: 'Explore a 3-day Satvic cooking workshop in Bangalore', source: 'People are asking for offline experiences in Bangalore.', feature: 'ideas', status: 'captured', due: 'Unscheduled', plan: ['Research local demand and audience size', 'Estimate venue and operating costs', 'Identify instructors and pilot dates'] },
];
const stages: { id: JobStatus; label: string }[] = [
  { id: 'captured', label: 'Captured' }, { id: 'understood', label: 'Understood' },
  { id: 'in-progress', label: 'In progress' }, { id: 'done', label: 'Done' },
];

function makeJob(text: string, feature: FeatureId, due = 'Unscheduled'): Job {
  const lower = text.toLowerCase();
  const title = lower.includes('community guide') ? 'Build a Satvic Movement Community Guide'
    : lower.includes('workshop') ? 'Explore a Satvic cooking workshop'
      : text.trim().replace(/^we need to\s+/i, '').replace(/[.!?]+$/, '').slice(0, 90);
  const plans: Record<FeatureId, string[]> = {
    overview: ['Clarify the desired outcome', 'Choose an owner and next step'],
    'founder-mind': ['Clarify the thought and intended outcome', 'Choose whether to explore, save, reject, or execute'],
    voice: ['Choose audience and channel', 'Draft for founder review before sending'],
    meetings: ['Record the decision and context', 'Confirm owners, deadlines, and follow-up'],
    people: ['Identify required skills and capacity', 'Ask the relevant manager to confirm collaborators'],
    ideas: ['Research demand and alternatives', 'Estimate costs, risks, and feasibility', 'Bring a recommendation for founder approval'],
    projects: ['Define scope and success measures', 'Break the work into milestones and owners', 'Review timeline and approve execution'],
    memory: ['Find prior discussions and decisions', 'Attach evidence and note what has changed'],
  };
  return { id: `job-${Date.now()}`, title, source: text, feature, status: 'captured', due, plan: plans[feature] };
}

export default function FounderOfficeDashboard({ accountEmail = '' }: { accountEmail?: string }) {
  const [activeFeature, setActiveFeature] = useState<FeatureId>('overview');
  const [jobs, setJobs] = useState<Job[]>(demoJobs);
  const [chatMessages, setChatMessages] = useState<FounderMessage[]>([]);
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<JobStatus | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDetails, setJobDetails] = useState('');
  const [jobDue, setJobDue] = useState('');
  const [jobFeature, setJobFeature] = useState<FeatureId>('projects');
  const [showNewJob, setShowNewJob] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [dockedJobId, setDockedJobId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showThoughtLine, setShowThoughtLine] = useState(false);
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[]>([
    { to: 'Support team', subject: 'Community guide - next steps', body: 'Hi team,\n\nLet us align on the community guide scope and the locations we need to verify. Please share your updates before our review.\n\nThank you', status: 'Draft Done' },
    { to: '', subject: '', body: '', status: 'Draft Done' },
    { to: '', subject: '', body: '', status: 'Draft Done' },
  ]);
  const [selectedEmailDraft, setSelectedEmailDraft] = useState<number | null>(null);
  const [voicePanels, setVoicePanels] = useState<VoicePanelId[]>(['announcement', 'workshop']);
  const [voiceDrafts, setVoiceDrafts] = useState<Record<VoicePanelId, VoiceDraftEntry[]>>(() => Object.fromEntries(Object.entries(voicePanelCatalog).map(([id, item]) => [id, item.content ? [{ id: `${id}-starter`, title: item.title.replace(/s$/, '') + ' draft', content: item.content, saved: true }] : []])) as Record<VoicePanelId, VoiceDraftEntry[]>);
  const [newVoicePanel, setNewVoicePanel] = useState<VoicePanelId | ''>('');
  const [openVoiceEditor, setOpenVoiceEditor] = useState<'email' | VoicePanelId | null>(null);
  const [selectedVoiceDraft, setSelectedVoiceDraft] = useState<{ panel: VoicePanelId; id: string } | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const processingController = useRef<AbortController | null>(null);
  const current = featureInfo[activeFeature];
  const selectedJob = jobs.find(job => job.id === selectedJobId) ?? null;
  const dockedJob = jobs.find(job => job.id === dockedJobId) ?? null;

  useEffect(() => { const thread = chatThreadRef.current; if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' }); }, [chatMessages, isStreaming]);

  function addJob(text: string, destination: FeatureId, due = 'Unscheduled', options: { title?: string; plan?: string[]; openDetails?: boolean } = {}) {
    const baseJob = makeJob(text, destination, due);
    const job = { ...baseJob, title: options.title || baseJob.title, plan: options.plan?.length ? options.plan : baseJob.plan };
    setJobs(items => [job, ...items]);
    setShowNewJob(false);
    setJobTitle(''); setJobDetails(''); setJobDue('');
    if (options.openDetails !== false) setSelectedJobId(job.id);
    return job;
  }

  function submitNewJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = [jobTitle.trim(), jobDetails.trim()].filter(Boolean).join('. ');
    if (text) addJob(text, jobFeature, jobDue || 'Unscheduled');
  }

  useEffect(() => () => { processingController.current?.abort(); }, []);

  function stopMindInput() {
    processingController.current?.abort();
    setIsStreaming(false);
    setChatMessages(items => [...items, { id: `msg-${Date.now()}`, role: 'assistant', text: 'I stopped generating.' }]);
  }

  function startNewChat() {
    processingController.current?.abort();
    processingController.current = null;
    setIsStreaming(false);
    setShowThoughtLine(false);
    setChatMessages([]);
    setChatSessionKey(key => key + 1);
  }

  async function sendMindInput(text: string, files: File[]) {
    if (isStreaming) return;
    const prompt = [text, files.length ? `Attachments: ${files.map(file => file.name).join(', ')}` : ''].filter(Boolean).join('\n');
    if (!prompt) return;
    const controller = new AbortController();
    processingController.current = controller;
    setIsStreaming(true);
    setShowThoughtLine(true);
    setChatMessages(items => [...items, { id: `msg-${Date.now()}`, role: 'user', text: prompt }]);
    try {
      const response = await fetch('/api/founder/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ message: prompt, history: chatMessages.slice(-12).map(message => ({ role: message.role, content: message.text })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Founder Mind could not reply.');
      let createdJob: Job | undefined;
      if (result.type === 'job') {
        const feature = (['voice', 'meetings', 'people', 'ideas', 'projects', 'memory'] as FeatureId[]).includes(result.feature) ? result.feature as FeatureId : 'projects';
        const due = typeof result.due === 'string' ? result.due : 'Unscheduled';
        const plan = Array.isArray(result.plan) ? result.plan.filter((step: unknown): step is string => typeof step === 'string') : [];
        createdJob = addJob(prompt, feature, due, { title: typeof result.title === 'string' ? result.title : undefined, plan, openDetails: false });
      }
      setChatMessages(items => [...items, { id: `msg-${Date.now()}-reply`, role: 'assistant', text: typeof result.answer === 'string' ? result.answer : 'I am here. What would you like to think through?', job: createdJob }]);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        const message = error instanceof Error ? error.message : 'Founder Mind could not reply. Please try again.';
        setChatMessages(items => [...items, { id: `msg-${Date.now()}-error`, role: 'assistant', text: message }]);
      }
    } finally {
      if (!controller.signal.aborted) setIsStreaming(false);
      if (processingController.current === controller) processingController.current = null;
    }
  }

  function updateStatus(jobId: string, status: JobStatus) {
    setJobs(items => items.map(job => job.id === jobId ? { ...job, status } : job));
  }

  const jobPipeline = <section className="founder-job-board" aria-label={`${current.title} jobs`}>
    {stages.map(stage => {
      const stageJobs = jobs.filter(job => job.status === stage.id && (activeFeature === 'overview' || job.feature === activeFeature));
      return <div className={`founder-job-column${dropTargetStatus === stage.id ? ' drop-target' : ''}`} key={stage.id}
        onDragOver={event => { event.preventDefault(); setDropTargetStatus(stage.id); }}
        onDragEnter={() => setDropTargetStatus(stage.id)}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTargetStatus(null); }}
        onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain') || draggingJobId; if (id) updateStatus(id, stage.id); setDraggingJobId(null); setDropTargetStatus(null); }}>
        <header><span>{stage.label}</span><b>{stageJobs.length}</b></header>
        {stageJobs.map(job => <article className={`founder-job-card${draggingJobId === job.id ? ' dragging' : ''}`} key={job.id} draggable
          onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', job.id); setDraggingJobId(job.id); }}
          onDragEnd={() => { setDraggingJobId(null); setDropTargetStatus(null); }}>
          <span className="founder-job-feature">{featureInfo[job.feature].title}</span><h3>{job.title}</h3>
          <p>{job.due === 'Unscheduled' ? 'No deadline set' : job.due === '30 days' ? 'Due in 30 days' : `Due ${job.due}`}</p>
          <button type="button" draggable={false} onClick={() => setSelectedJobId(job.id)}>{stage.id === 'captured' ? 'Understand' : 'Open job'} <ArrowRight size={14}/></button>
        </article>)}
        {stageJobs.length === 0 && <p className="founder-column-empty">Drop a job here</p>}
      </div>;
    })}
  </section>;

  function updateVoiceDraft(panel: VoicePanelId, draftId: string, value: string) {
    setVoiceDrafts(items => ({ ...items, [panel]: items[panel].map(draft => draft.id === draftId ? { ...draft, content: value, saved: false } : draft) }));
  }

  function addVoiceDraft(panel: VoicePanelId) {
    const id = `${panel}-${Date.now()}`;
    setVoiceDrafts(items => ({ ...items, [panel]: [...items[panel], { id, title: `New ${voicePanelCatalog[panel].title.replace(/s$/, '').toLowerCase()}`, content: '', saved: false }] }));
    setSelectedVoiceDraft({ panel, id });
    setOpenVoiceEditor(panel);
  }

  return <ProductDashboardShell productId="founder-office" accountEmail={accountEmail} onNotice={() => {}} initialFeatureId="overview" onFeatureSelect={id => { if (id in featureInfo) setActiveFeature(id as FeatureId); }}>
    <section className="welcome-row founder-welcome"><div><h1>{current.title}</h1><p className="welcome-subtitle">{current.description}</p></div><button type="button" className="primary-btn founder-new-job-trigger" onClick={() => { setJobFeature(activeFeature === 'overview' || activeFeature === 'founder-mind' ? 'projects' : activeFeature); setShowNewJob(true); }}><Plus size={16}/> New job</button></section>

    {activeFeature === 'founder-mind' && <section className="founder-mind-workspace"><div className="founder-mind-history"><button type="button" className="founder-new-chat" onClick={startNewChat}><Plus size={15}/> New chat</button><span className="section-kicker">RECENT JOBS</span>{jobs.slice(0, 5).map(job => <button type="button" key={job.id} onClick={() => setSelectedJobId(job.id)}><span>{job.title}</span><small>{featureInfo[job.feature].title}</small></button>)}</div><div className="founder-mind-main"><div className="founder-mind-conversation">{chatMessages.length === 0 ? <div className="founder-mind-empty"><span className="founder-ai-mark"><Brain size={24}/></span><h2>What are you thinking about?</h2><p>Ask a question, explore an idea, or describe work you want to start. I will answer normally and only create a job when you clearly ask for one.</p></div> : <div className="founder-chat-thread" ref={chatThreadRef} aria-live="polite">{chatMessages.map(message => <article className={`founder-chat-turn ${message.role}`} key={message.id}><span>{message.role === 'user' ? 'You' : 'Founder Mind'}</span><p>{message.text}</p>{message.job && <button type="button" className="founder-chat-job-link" onClick={() => { setActiveFeature(message.job!.feature); setSelectedJobId(message.job!.id); }}>Open job in {featureInfo[message.job.feature].title} <ArrowRight size={14}/></button>}</article>)}</div>}{showThoughtLine && <ThoughtLine working={isStreaming} steps={['Reading your message', 'Thinking through a response', 'Preparing a reply']} label="Thinking..." doneLabel="Thought for" glyph="sparkle" fontSize={13} breathPeriod={1.6} breathDepth={0.45} settleDuration={350} settleBlur={0} collapsible collapseOnSettle showTimer/>}</div><FounderPromptBar key={chatSessionKey} busy={isStreaming} onSend={sendMindInput} onStop={stopMindInput}/></div></section>}

    {activeFeature === 'voice' && <div className="founder-voice-page">
      {jobPipeline}
      <section className="founder-voice-studio"><div className="founder-voice-grid">
        <article className={`founder-email-panel founder-communication-card${openVoiceEditor === 'email' ? ' is-open' : ''}`}>
          <header className="founder-draft-emails-heading"><span>Draft Emails</span><small>{emailDrafts.length} drafts</small></header>
          <div className="founder-email-list">{emailDrafts.map((draft, index) => <div className={`founder-email-row-wrap${selectedEmailDraft === index && openVoiceEditor === 'email' ? ' is-open' : ''}`} key={index}>
            <button type="button" className="founder-email-row" aria-expanded={selectedEmailDraft === index && openVoiceEditor === 'email'} onClick={() => { setSelectedEmailDraft(index); setOpenVoiceEditor(openVoiceEditor === 'email' && selectedEmailDraft === index ? null : 'email'); }}>
              <span className="founder-email-row-copy"><span>{draft.to ? `to ${draft.to.toLowerCase()}` : 'To'}</span><strong>{draft.subject || 'Email subject'}</strong></span>
              <span className="founder-email-row-state">{draft.to || draft.subject || draft.body ? draft.status : ''}</span><ArrowRight size={20}/>
            </button>
            {selectedEmailDraft === index && openVoiceEditor === 'email' && <div className="founder-communication-editor">
              <label>To<select value={draft.to} onChange={event => setEmailDrafts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, to: event.target.value } : item))}><option value="">Choose a team</option><option>Support team</option><option>Editing team</option><option>Accounts team</option><option>Leadership team</option><option>Community team</option></select></label>
              <label>Subject<input value={draft.subject} onChange={event => setEmailDrafts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, subject: event.target.value } : item))} placeholder="Email subject"/></label>
              <label>Message<textarea value={draft.body} onChange={event => setEmailDrafts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} rows={8} placeholder="Write your email..."/></label>
              <div className="founder-email-actions"><button type="button" className="founder-secondary-btn" onClick={() => setEmailDrafts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, status: 'Draft Done' } : item))}>Save draft</button><button type="button" className="primary-btn" onClick={() => setEmailDrafts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, status: 'Ready for review' } : item))}>Request review <ArrowRight size={15}/></button></div>
            </div>}
          </div>)}</div>
        </article>        <aside className="founder-voice-side"><div className="founder-voice-panels">{voicePanels.map(id => <article className={`founder-voice-card founder-communication-card tone-${id}`} key={id}>
          <header className="founder-communication-heading"><span>{voicePanelCatalog[id].title}</span><button type="button" className="founder-remove-panel" aria-label={`Remove ${voicePanelCatalog[id].title}`} title="Remove container" onClick={() => { setVoicePanels(items => items.filter(item => item !== id)); if (openVoiceEditor === id) setOpenVoiceEditor(null); }}><X size={14}/></button></header>
          <div className="founder-voice-draft-list">{voiceDrafts[id].map(draft => <div className={`founder-voice-draft-wrap${selectedVoiceDraft?.id === draft.id && openVoiceEditor === id ? ' is-open' : ''}`} key={draft.id}>
            <button type="button" className="founder-voice-draft-row" aria-expanded={selectedVoiceDraft?.id === draft.id && openVoiceEditor === id} onClick={() => { setSelectedVoiceDraft({ panel: id, id: draft.id }); setOpenVoiceEditor(openVoiceEditor === id && selectedVoiceDraft?.id === draft.id ? null : id); }}><span><strong>{draft.title}</strong>{draft.saved && <small>Draft Done</small>}</span><ArrowRight size={18}/></button>
            {selectedVoiceDraft?.id === draft.id && openVoiceEditor === id && <div className="founder-communication-editor"><textarea value={draft.content} placeholder={voicePanelCatalog[id].placeholder} rows={4} onChange={event => updateVoiceDraft(id, draft.id, event.target.value)}/><button type="button" className="founder-voice-save" onClick={() => setVoiceDrafts(items => ({ ...items, [id]: items[id].map(item => item.id === draft.id ? { ...item, saved: true } : item) }))}>Save draft <ArrowRight size={13}/></button></div>}
          </div>)}</div>
          <button type="button" className="founder-add-voice-draft" onClick={() => addVoiceDraft(id)}><Plus size={14}/> Add draft</button>
        </article>)}</div><div className="founder-add-panel"><select aria-label="Choose a communication container" value={newVoicePanel} onChange={event => setNewVoicePanel(event.target.value as VoicePanelId | '')}><option value="">Add a communication type...</option>{(Object.keys(voicePanelCatalog) as VoicePanelId[]).filter(id => !voicePanels.includes(id)).map(id => <option value={id} key={id}>{voicePanelCatalog[id].title}</option>)}</select><button type="button" disabled={!newVoicePanel} onClick={() => { if (newVoicePanel) { setVoicePanels(items => [...items,newVoicePanel]); setNewVoicePanel(''); } }}><Plus size={15}/> Add container</button></div></aside>      </div></section>
    </div>}
    {activeFeature !== 'founder-mind' && activeFeature !== 'voice' && <>{activeFeature === 'overview' && <div className="founder-pipeline-intro"><b>One workflow, from thought to outcome</b><span>Captured &gt; understood &gt; approved for work &gt; completed</span></div>}{jobPipeline}{activeFeature === 'overview' && <div className="founder-workflow-note">New thoughts are sorted into the relevant feature, then reviewed here. Nothing is assigned, funded, or started without approval.</div>}</>}
    {showNewJob && <div className="founder-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowNewJob(false); }}><form className="founder-new-job-modal" onSubmit={submitNewJob}><button type="button" className="founder-modal-close" aria-label="Close" onClick={() => setShowNewJob(false)}><X size={18}/></button><span className="section-kicker">MANUAL JOB</span><h2>Create a job</h2><p>Choose where it belongs. You can review the plan before work starts.</p><label>Job title<input required autoFocus value={jobTitle} onChange={event => setJobTitle(event.target.value)} placeholder="e.g. Launch a community guide"/></label><label>Context or desired outcome<textarea value={jobDetails} onChange={event => setJobDetails(event.target.value)} placeholder="Add useful context, timing, or constraints..." rows={3}/></label><label>Due date<input type="date" value={jobDue} onChange={event => setJobDue(event.target.value)}/></label><label>Send to<select value={jobFeature} onChange={event => setJobFeature(event.target.value as FeatureId)}>{Object.entries(featureInfo).filter(([id]) => id !== 'overview' && id !== 'founder-mind').map(([id, feature]) => <option key={id} value={id}>{feature.title}</option>)}</select></label><button type="submit" className="primary-btn"><Plus size={16}/> Create job</button></form></div>}

    {selectedJob && <div className="founder-job-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedJobId(null); }}><aside className="founder-job-detail"><button type="button" className="founder-modal-close" aria-label="Close job" onClick={() => setSelectedJobId(null)}><X size={18}/></button><span className="section-kicker">{featureInfo[selectedJob.feature].title.toUpperCase()} - JOB</span><h2>{selectedJob.title}</h2><p className="founder-job-source">{selectedJob.source}</p><div className="founder-job-route"><span>Suggested destination</span><b>{featureInfo[selectedJob.feature].title}</b></div><h3>Suggested plan</h3><ol>{selectedJob.plan.map(step => <li key={step}>{step}</li>)}</ol><div className="founder-job-detail-actions"><button type="button" className="founder-secondary-btn" onClick={() => { updateStatus(selectedJob.id, 'understood'); setDockedJobId(selectedJob.id); setSelectedJobId(null); }}>Understand & dock</button>{selectedJob.status !== 'done' && <button type="button" className="primary-btn" onClick={() => { updateStatus(selectedJob.id, 'in-progress'); setDockedJobId(selectedJob.id); setSelectedJobId(null); }}>Approve & start <ChevronRight size={16}/></button>}</div>{selectedJob.status !== 'done' && <button type="button" className="founder-done-action" onClick={() => { updateStatus(selectedJob.id, 'done'); setSelectedJobId(null); setDockedJobId(null); }}><Check size={15}/> Mark this job done</button>}</aside></div>}

    {dockedJob && !selectedJob && <button type="button" className="founder-docked-job" onClick={() => { setSelectedJobId(dockedJob.id); setDockedJobId(null); }}><span className="founder-docked-indicator"/><span><small>{featureInfo[dockedJob.feature].title}</small><b>{dockedJob.title}</b></span><ChevronRight size={17}/></button>}
  </ProductDashboardShell>;
}
