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

const demoJobs: Job[] = [
  { id: 'guide', title: 'Build a Satvic Movement Community Guide', source: 'We need to build a Satvic Movement Community Guide in 30 days.', feature: 'projects', status: 'understood', due: '30 days', plan: ['Define guide scope and target audience', 'Collect and verify community locations', 'Design and build the guide', 'Review and launch within 30 days'] },
  { id: 'workshop', title: 'Explore a 3-day Satvic cooking workshop in Bangalore', source: 'People are asking for offline experiences in Bangalore.', feature: 'ideas', status: 'captured', due: 'Unscheduled', plan: ['Research local demand and audience size', 'Estimate venue and operating costs', 'Identify instructors and pilot dates'] },
];
const stages: { id: JobStatus; label: string }[] = [
  { id: 'captured', label: 'Captured' }, { id: 'understood', label: 'Understood' },
  { id: 'in-progress', label: 'In progress' }, { id: 'done', label: 'Done' },
];

function routeFromText(text: string): FeatureId {
  const value = text.toLowerCase();
  if (/meeting|decision|deadline|discussion|minutes/.test(value)) return 'meetings';
  if (/hire|team|owner|capacity|people|skill/.test(value)) return 'people';
  if (/write|email|announce|message|reply|copy/.test(value)) return 'voice';
  if (/research|market|competitor|feasib|cost|workshop|opportunity|explore/.test(value)) return 'ideas';
  if (/memory|remember|previous decision|why did we/.test(value)) return 'memory';
  if (/project|build|launch|deliver|create|guide|website|30 days|days/.test(value)) return 'projects';
  return 'founder-mind';
}

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
  const processingTimer = useRef<number | null>(null);
  const processingController = useRef<AbortController | null>(null);
  const current = featureInfo[activeFeature];
  const selectedJob = jobs.find(job => job.id === selectedJobId) ?? null;
  const dockedJob = jobs.find(job => job.id === dockedJobId) ?? null;

  function addJob(text: string, destination: FeatureId, due = 'Unscheduled') {
    const job = makeJob(text, destination, due);
    setJobs(items => [job, ...items]);
    setShowNewJob(false);
    setJobTitle(''); setJobDetails(''); setJobDue('');
    setSelectedJobId(job.id);
    return job;
  }

  function submitNewJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = [jobTitle.trim(), jobDetails.trim()].filter(Boolean).join('. ');
    if (text) addJob(text, jobFeature, jobDue || 'Unscheduled');
  }

  useEffect(() => () => { if (processingTimer.current) window.clearTimeout(processingTimer.current); processingController.current?.abort(); }, []);

  function stopMindInput() {
    processingController.current?.abort();
    if (processingTimer.current) window.clearTimeout(processingTimer.current);
    processingTimer.current = null;
    setIsStreaming(false);
  }

  function sendMindInput(text: string, files: File[]) {
    if (isStreaming) return;
    const prompt = [text, files.length ? `Attachments: ${files.map(file => file.name).join(', ')}` : ''].filter(Boolean).join('\n');
    if (!prompt) return;
    const feature = routeFromText(prompt);
    const controller = new AbortController();
    processingController.current = controller;
    setIsStreaming(true);
    setShowThoughtLine(true);
    const due = /30 days|in a month/i.test(prompt) ? '30 days' : 'Unscheduled';
    processingTimer.current = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      addJob(prompt, feature, due);
      setIsStreaming(false);
    }, 1400);
  }

  function updateStatus(jobId: string, status: JobStatus) {
    setJobs(items => items.map(job => job.id === jobId ? { ...job, status } : job));
  }

  return <ProductDashboardShell productId="founder-office" accountEmail={accountEmail} onNotice={() => {}} initialFeatureId="overview" onFeatureSelect={id => { if (id in featureInfo) setActiveFeature(id as FeatureId); }}>
    <section className="welcome-row founder-welcome"><div><h1>{current.title}</h1><p className="welcome-subtitle">{current.description}</p></div><button type="button" className="primary-btn founder-new-job-trigger" onClick={() => { setJobFeature(activeFeature === 'overview' || activeFeature === 'founder-mind' ? 'projects' : activeFeature); setShowNewJob(true); }}><Plus size={16}/> New job</button></section>

    {activeFeature === 'founder-mind' && <section className="founder-mind-workspace"><div className="founder-mind-history"><span className="section-kicker">RECENT JOBS</span>{jobs.slice(0, 5).map(job => <button type="button" key={job.id} onClick={() => setSelectedJobId(job.id)}><span>{job.title}</span><small>{featureInfo[job.feature].title}</small></button>)}</div><div className="founder-mind-main"><div className="founder-mind-empty"><span className="founder-ai-mark"><Brain size={24}/></span><h2>What are you thinking about?</h2><p>Share a goal or a problem. Founder Office will suggest a place for it in your workflow. You approve every next step.</p>{showThoughtLine && <ThoughtLine working={isStreaming} steps={['Reading the goal', 'Choosing the right feature', 'Preparing a job plan']} label="Thinking…" doneLabel="Thought for" glyph="sparkle" fontSize={13} breathPeriod={1.6} breathDepth={0.45} settleDuration={350} settleBlur={2} collapsible collapseOnSettle showTimer/>}</div><FounderPromptBar busy={isStreaming} onSend={sendMindInput} onStop={stopMindInput}/></div></section>}

    {activeFeature !== 'founder-mind' && <>{activeFeature === 'overview' && <div className="founder-pipeline-intro"><b>One workflow, from thought to outcome</b><span>Captured → understood → approved for work → completed</span></div>}<section className="founder-job-board" aria-label={`${current.title} jobs`}>
      {stages.map(stage => { const stageJobs = jobs.filter(job => job.status === stage.id && (activeFeature === 'overview' || job.feature === activeFeature)); return <div className={`founder-job-column${dropTargetStatus === stage.id ? ' drop-target' : ''}`} key={stage.id} onDragOver={event => { event.preventDefault(); setDropTargetStatus(stage.id); }} onDragEnter={() => setDropTargetStatus(stage.id)} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTargetStatus(null); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain') || draggingJobId; if (id) updateStatus(id, stage.id); setDraggingJobId(null); setDropTargetStatus(null); }}><header><span>{stage.label}</span><b>{stageJobs.length}</b></header>{stageJobs.map(job => <article className={`founder-job-card${draggingJobId === job.id ? ' dragging' : ''}`} key={job.id} draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', job.id); setDraggingJobId(job.id); }} onDragEnd={() => { setDraggingJobId(null); setDropTargetStatus(null); }}><span className="founder-job-feature">{featureInfo[job.feature].title}</span><h3>{job.title}</h3><p>{job.due === 'Unscheduled' ? 'No deadline set' : job.due === '30 days' ? 'Due in 30 days' : `Due ${job.due}`}</p><button type="button" draggable={false} onClick={() => setSelectedJobId(job.id)}>{stage.id === 'captured' ? 'Understand' : 'Open job'} <ArrowRight size={14}/></button></article>)}{stageJobs.length === 0 && <p className="founder-column-empty">Drop a job here</p>}</div>})}
    </section>{activeFeature === 'overview' && <div className="founder-workflow-note">New thoughts are sorted into the relevant feature, then reviewed here. Nothing is assigned, funded, or started without approval.</div>}</>}

    {showNewJob && <div className="founder-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowNewJob(false); }}><form className="founder-new-job-modal" onSubmit={submitNewJob}><button type="button" className="founder-modal-close" aria-label="Close" onClick={() => setShowNewJob(false)}><X size={18}/></button><span className="section-kicker">MANUAL JOB</span><h2>Create a job</h2><p>Choose where it belongs. You can review the plan before work starts.</p><label>Job title<input required autoFocus value={jobTitle} onChange={event => setJobTitle(event.target.value)} placeholder="e.g. Launch a community guide"/></label><label>Context or desired outcome<textarea value={jobDetails} onChange={event => setJobDetails(event.target.value)} placeholder="Add useful context, timing, or constraints…" rows={3}/></label><label>Due date<input type="date" value={jobDue} onChange={event => setJobDue(event.target.value)}/></label><label>Send to<select value={jobFeature} onChange={event => setJobFeature(event.target.value as FeatureId)}>{Object.entries(featureInfo).filter(([id]) => id !== 'overview' && id !== 'founder-mind').map(([id, feature]) => <option key={id} value={id}>{feature.title}</option>)}</select></label><button type="submit" className="primary-btn"><Plus size={16}/> Create job</button></form></div>}

    {selectedJob && <div className="founder-job-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedJobId(null); }}><aside className="founder-job-detail"><button type="button" className="founder-modal-close" aria-label="Close job" onClick={() => setSelectedJobId(null)}><X size={18}/></button><span className="section-kicker">{featureInfo[selectedJob.feature].title.toUpperCase()} · JOB</span><h2>{selectedJob.title}</h2><p className="founder-job-source">{selectedJob.source}</p><div className="founder-job-route"><span>Suggested destination</span><b>{featureInfo[selectedJob.feature].title}</b></div><h3>Suggested plan</h3><ol>{selectedJob.plan.map(step => <li key={step}>{step}</li>)}</ol><div className="founder-job-detail-actions"><button type="button" className="founder-secondary-btn" onClick={() => { updateStatus(selectedJob.id, 'understood'); setDockedJobId(selectedJob.id); setSelectedJobId(null); }}>Understand & dock</button>{selectedJob.status !== 'done' && <button type="button" className="primary-btn" onClick={() => { updateStatus(selectedJob.id, 'in-progress'); setDockedJobId(selectedJob.id); setSelectedJobId(null); }}>Approve & start <ChevronRight size={16}/></button>}</div>{selectedJob.status !== 'done' && <button type="button" className="founder-done-action" onClick={() => { updateStatus(selectedJob.id, 'done'); setSelectedJobId(null); setDockedJobId(null); }}><Check size={15}/> Mark this job done</button>}</aside></div>}

    {dockedJob && !selectedJob && <button type="button" className="founder-docked-job" onClick={() => { setSelectedJobId(dockedJob.id); setDockedJobId(null); }}><span className="founder-docked-indicator"/><span><small>{featureInfo[dockedJob.feature].title}</small><b>{dockedJob.title}</b></span><ChevronRight size={17}/></button>}
  </ProductDashboardShell>;
}
