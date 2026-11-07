'use client';

import { useMemo, useState } from 'react';
import {
  Activity, ArrowDown, ArrowDownToLine, ArrowRight, AudioLines, BadgeCheck, Bell, BookOpen,
  Check, CheckCheck, ChevronDown, CircleHelp, Clock3, FileAudio, FileText, Filter, FlaskConical,
  Globe2, Headphones, Heart, Languages, LayoutDashboard, ListChecks, Menu, MoreHorizontal,
  Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Upload, WandSparkles, X, Zap,
} from 'lucide-react';

type Issue = { title: string; detail: string; time?: string; source?: string; severity: 'critical' | 'review' | 'info'; category?: string; sourceStart?: number; sourceEnd?: number; dubStart?: number; dubEnd?: number; evidenceStatus?: 'cross-checked' | 'audio-only' | 'transcript-only'; sourceQuote?: string; dubQuote?: string };
type Project = { title: string; source: string; target: string; status: 'Needs review' | 'In progress' | 'Ready'; issues: number; date: string; color: string; initials: string };
type TranscriptSegment = { start: number; end: number; text: string; words?: { start: number; end: number; text: string }[] };
type AnalysisReport = { project: string; sourceLanguage: string; targetLanguage: string; createdAt: string; originalTranscript: string; dubbedTranscript: string; backTranslation: string; findings: Issue[]; disclaimer: string; originalSegments: TranscriptSegment[]; dubbedSegments: TranscriptSegment[]; timestampsAvailable: boolean; transcriptionEngine: string; semanticReviewEngine: string | null; transcriptCrossCheckAvailable: boolean; transcriptCrossCheckError?: string | null; reviewCoverageWarnings?: string[]; reviewComplete?: boolean; generatedBySarvam?: boolean; originalVideoUrl?: string; dubbedVideoUrl?: string };

const initialProjects: Project[] = [];
const issues: Issue[] = [];

const languages = ['Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Bengali', 'Marathi', 'Punjabi', 'Malayalam', 'Hindi', 'English', 'Assamese', 'Odia'];
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const formatDuration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
const remainingEstimate = (range: { min: number; max: number } | null, elapsed: number) => {
  if (!range) return 'Estimating from video durationâ€¦';
  if (elapsed >= range.max) return 'Taking longer than the initial estimate';
  const min = Math.max(0, range.min - elapsed);
  const max = Math.max(0, range.max - elapsed);
  return `${formatDuration(min)}â€“${formatDuration(max)} estimated left`;
};

function readMediaDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const media = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    const url = URL.createObjectURL(file);
    let completed = false;
    let timer = 0;
    const finish = (duration: number) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timer);
      media.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(0);
    media.src = url;
    timer = window.setTimeout(() => finish(0), 8000);
  });
}

export default function Home() {
  const [projects, setProjects] = useState(initialProjects);
  const [activeTab, setActiveTab] = useState('All projects');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState<Project | null>(null);
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState('Hindi');
  const [target, setTarget] = useState('Tamil');
  const [generationMode, setGenerationMode] = useState<'sarvam' | 'existing'>('sarvam');
  const [projectName, setProjectName] = useState('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [dubbedFile, setDubbedFile] = useState<File | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ stage: '', percent: 0, status: 'idle' as 'idle' | 'processing' | 'complete' | 'error', startedAt: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedRange, setEstimatedRange] = useState<{ min: number; max: number } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const visibleProjects = useMemo(() => projects.filter((p) => {
    const matchQuery = `${p.title} ${p.target} ${p.source}`.toLowerCase().includes(query.toLowerCase());
    const matchTab = activeTab === 'All projects' || (activeTab === 'Needs review' && p.status === 'Needs review') || (activeTab === 'In progress' && p.status === 'In progress') || (activeTab === 'Ready' && p.status === 'Ready');
    return matchQuery && matchTab;
  }), [projects, query, activeTab]);

  const reportVerdict = report?.findings.some((finding) => finding.severity === 'critical')
    ? { title: 'AI heard a possible serious mismatch', note: 'The audio comparison found a possible meaning change. Play the linked source and dub ranges to inspect the exact place.' }
    : report?.findings.some((finding) => finding.severity === 'review')
      ? { title: 'AI found an issue to inspect', note: 'The AI heard a possible change or delivery issue. Play the linked time ranges to hear what it flagged.' }
      : report && report.reviewComplete === false
        ? { title: 'Review incomplete — not a clean pass', note: 'One or more review checks timed out or could not cover the full transcript. A zero-flag result here does not mean the dub is correct.' }
        : report
          ? { title: 'No major issue flagged by the AI', note: 'The AI did not detect a major issue. This is not a guarantee; speech recognition and audio analysis can miss mistakes.' }
        : null;

  async function runAnalysis(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!originalFile || (generationMode === 'existing' && !dubbedFile)) { setNotice(generationMode === 'sarvam' ? 'Select the original video to send to Sarvam.' : 'Select both the original and dubbed video to start QA.'); return; }
    if (generationMode === 'sarvam' && source === target) { setNotice('Choose a target language different from the source language.'); return; }
    const progressId = crypto.randomUUID();
    const startedAt = Date.now();
    setBusy(true);
    setAnalysisProgress({ stage: 'Uploading videos to the local analyzer', percent: 3, status: 'processing', startedAt });
    setElapsedSeconds(0);
    setEstimatedRange(null);
    const elapsedTimer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    let polling = true;
    let pollInFlight = false;
    const pollTimer = window.setInterval(async () => {
      if (!polling || pollInFlight) return;
      pollInFlight = true;
      try {
        const response = await fetch(`/api/analyze/progress?id=${encodeURIComponent(progressId)}&t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const update = await response.json();
          setAnalysisProgress({ stage: update.stage, percent: update.percent, status: update.status, startedAt: update.startedAt || startedAt });
        }
      } catch { /* The main analysis request remains authoritative. */ }
      finally { pollInFlight = false; }
    }, 1200);
    void Promise.all([readMediaDuration(originalFile), generationMode === 'existing' && dubbedFile ? readMediaDuration(dubbedFile) : Promise.resolve(0)]).then(([originalDuration, dubDuration]) => {
      const longest = Math.max(originalDuration, dubDuration);
      if (longest > 0) setEstimatedRange({ min: Math.max(60, Math.round(longest * 0.45 + 45)), max: Math.max(180, Math.round(longest * 1.7 + 120)) });
    });
    let finalDub = dubbedFile;
    try {
      if (generationMode === 'sarvam') {
        setAnalysisProgress({ stage: 'Uploading original to Sarvam Dubbing', percent: 5, status: 'processing', startedAt });
        const dubbingForm = new FormData();
        dubbingForm.set('original', originalFile); dubbingForm.set('sourceLanguage', source); dubbingForm.set('targetLanguage', target); dubbingForm.set('projectName', projectName || originalFile.name);
        const startResponse = await fetch('/api/dubbing', { method: 'POST', body: dubbingForm });
        const startBody = await startResponse.json();
        if (!startResponse.ok) throw new Error(startBody.error || 'Could not start Sarvam dubbing.');
        const deadline = Date.now() + 60 * 60 * 1000;
        let ready = false;
        while (Date.now() < deadline) {
          await new Promise(resolve => window.setTimeout(resolve, 8000));
          const statusResponse = await fetch(`/api/dubbing/status?jobId=${encodeURIComponent(startBody.jobId)}&t=${Date.now()}`, { cache: 'no-store' });
          const status = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(status.error || 'Could not check Sarvam dubbing status.');
          const stagePercent = Math.min(70, Math.max(8, Math.round((status.progress || 0) * 0.65) + 8));
          setAnalysisProgress({ stage: status.step || 'Sarvam is creating the dub', percent: stagePercent, status: 'processing', startedAt });
          if (status.error) throw new Error(status.error);
          if (status.ready) { ready = true; break; }
        }
        if (!ready) throw new Error('Sarvam dubbing is still processing after an hour. Your job remains in Sarvam; try again later using the existing-dub option after downloading it from your Sarvam workspace.');
        setAnalysisProgress({ stage: 'Downloading Sarvam dubbed video', percent: 72, status: 'processing', startedAt });
        const downloadResponse = await fetch(`/api/dubbing/download?jobId=${encodeURIComponent(startBody.jobId)}`);
        if (!downloadResponse.ok) { const body = await downloadResponse.json().catch(() => ({})); throw new Error(body.error || 'Could not download the Sarvam dubbed video.'); }
        const dubbedBlob = await downloadResponse.blob();
        finalDub = new File([dubbedBlob], `${(projectName || originalFile.name.replace(/\.[^.]+$/, '')).replace(/[^\w.-]+/g, '-')}-${target.toLowerCase()}-dub.mp4`, { type: dubbedBlob.type || 'video/mp4' });
      }
      if (!finalDub) throw new Error('No dubbed media is available for QA.');
      setAnalysisProgress({ stage: 'Starting speech transcription and audio comparison', percent: 74, status: 'processing', startedAt });
      const form = new FormData();
      form.set('original', originalFile); form.set('dubbed', finalDub);
      form.set('sourceLanguage', source); form.set('targetLanguage', target); form.set('projectName', projectName);
      form.set('progressId', progressId);
      const response = await fetch('/api/analyze', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Analysis failed.');
      const result = body as AnalysisReport;
      result.originalVideoUrl = URL.createObjectURL(originalFile);
      result.dubbedVideoUrl = URL.createObjectURL(finalDub);
      result.generatedBySarvam = generationMode === 'sarvam';
      const title = result.project || projectName || originalFile.name.replace(/\.[^.]+$/, '');
      const project: Project = { title, source, target, status: 'Needs review', issues: result.findings.length, date: 'Just now', color: 'lilac', initials: title.slice(0, 2).toUpperCase() };
      setReport(result); setProjects((prev) => [project, ...prev]); setDetails(project);
      setModal(false); setOriginalFile(null); setDubbedFile(null); setProjectName(''); setNotice(generationMode === 'sarvam' ? 'Sarvam generated the dub. Gemini listened to both tracks and created the QA report.' : 'AI listened to both audio tracks. Open the report for timestamped findings.');
      window.setTimeout(() => setNotice(''), 4500);
    } catch (error) {
      if (generationMode === 'sarvam' && finalDub && originalFile) {
        setDubbedFile(finalDub);
        setGenerationMode('existing');
        setNotice(`Sarvam created the dub, but QA did not finish. The generated file is kept here; click “Run AI dub review” to retry without generating another dub. ${error instanceof Error ? error.message : ''}`);
      } else {
      setNotice(error instanceof Error ? error.message : 'Analysis failed. Check your API setup and try again.');
      }
    } finally {
      polling = false;
      window.clearInterval(pollTimer);
      window.clearInterval(elapsedTimer);
      setBusy(false);
    }
  }

  function exportReport() {
    if (!report) { setNotice('Run a real analysis before exporting a report.'); return; }
    const { originalVideoUrl, dubbedVideoUrl, ...exportable } = report;
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${report.project.replace(/[^\w-]+/g, '-')}-qa-report.json`; a.click(); URL.revokeObjectURL(url); setNotice('Analysis report downloaded as JSON.'); window.setTimeout(() => setNotice(''), 3500);
  }

  function playSegment(videoId: string, seconds: number, endSeconds?: number) {
    const video = document.getElementById(videoId) as HTMLVideoElement | null;
    if (!video) return;
    const rangeKey = `${seconds}:${endSeconds ?? ''}`;
    if (video.dataset.reviewRange === rangeKey && !video.paused) {
      video.pause();
      video.ontimeupdate = null;
      return;
    }
    video.ontimeupdate = null;
    video.dataset.reviewRange = rangeKey;
    video.currentTime = Math.max(0, seconds);
    if (endSeconds !== undefined && endSeconds > seconds) {
      video.ontimeupdate = () => {
        if (video.currentTime >= endSeconds) {
          video.pause();
          video.ontimeupdate = null;
        }
      };
    }
    void video.play().catch(() => setNotice('Could not start this video. Try using the video player controls.'));
  }

  return (
    <main className="app-shell">
      <aside className={cx('sidebar', navOpen && 'sidebar-open')}>
        <div className="brand"><div className="brand-mark"><span /><span /><span /></div><div><strong>satvic<span className="brand-dot">.</span></strong><small>CONTENT STUDIO</small></div><button className="icon-btn mobile-close" onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">S</div><div className="workspace-label"><b>Satvic Movement</b><span>Team workspace</span></div><ChevronDown size={15} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">
          <button className="nav-item active"><LayoutDashboard size={18} /><span>Overview</span></button>
          <button className="nav-item" onClick={() => setActiveTab('All projects')}><FileText size={18} /><span>All projects</span><span className="nav-count">{projects.length}</span></button>
          <button className="nav-item" onClick={() => setActiveTab('Needs review')}><ListChecks size={18} /><span>Review queue</span><span className="nav-badge">{projects.filter(p=>p.status==='Needs review').length}</span></button>
          <button className="nav-item" onClick={() => setNotice('Language coverage: Hindi, Tamil, Telugu, Gujarati, Kannada, Bengali, Marathi and more.')}><Globe2 size={18} /><span>Languages</span></button>
        </nav>
        <div className="nav-label nav-label-spaced">TOOLS</div>
        <nav className="main-nav">
          <button className="nav-item" onClick={() => setNotice('Terminology library is ready for your preferred translations and words to preserve.')}><BookOpen size={18} /><span>Term library</span><span className="tiny-new">NEW</span></button>
          <button className="nav-item" onClick={() => setNotice('Quality settings are being prepared for this local workspace.')}><Settings2 size={18} /><span>QA settings</span></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="plan-card"><div className="plan-icon"><Sparkles size={16} /></div><strong>AI dubbing review</strong><p>AI compares both spoken tracks and marks suspected issues with times.</p><button onClick={() => setNotice('Your local workspace keeps this review workflow on your device.')}>How it works <ArrowRight size={13} /></button><div className="plan-glow" /></div>
        <button className="profile-row"><div className="profile-avatar">PK</div><div className="profile-copy"><b>Piyush Kumar</b><span>Founderâ€™s Office applicant</span></div><MoreHorizontal size={19} /></button>
      </aside>

      <section className="main-area">
        <header className="topbar"><button className="icon-btn menu-trigger" onClick={() => setNavOpen(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>Overview</b></div><div className="top-actions"><div className="local-pill"><span /> Local workspace</div><button className="icon-btn" aria-label="Help" onClick={() => setNotice('This workspace uses AI-assisted checks. AI compares both audio tracks and points to the times that may contain an issue.')}><CircleHelp size={18} /></button><button className="icon-btn notification-btn" aria-label="Notifications" onClick={() => setNotice(`You have ${projects.length} analyzed project(s) in this session.`)}><Bell size={18} /><i /></button><div className="top-divider" /><div className="mini-profile">PK</div></div></header>
        <div className="content-wrap">
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR MULTILINGUAL REVIEW DESK</div><h1>Good morning, Piyush <span className="wave">âœ³</span></h1><p className="welcome-subtitle">One source. Every language. Nothing important lost along the way.</p></div><button className="primary-btn" onClick={() => setModal(true)}><Plus size={17} /> New QA project</button></section>

          <section className="hero-panel"><div className="hero-text"><div className="hero-kicker"><WandSparkles size={14} /> THE DUBBING QUALITY WORKFLOW</div><h2>Make every translation<br />feel <em>like it belongs.</em></h2><p>Review meaning, completeness, health terminology and timing across your dubbed content â€” all in one thoughtful workspace.</p><button className="hero-button" onClick={() => setModal(true)}>Start a project <ArrowRight size={15} /></button><div className="hero-footnote"><ShieldCheck size={14} /> AI listens, compares, and points to the moment.</div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><div className="orbit-logo"><AudioLines size={27} /></div><span>VOICE<br />REVIEW</span></div><div className="float-chip chip-source"><span className="chip-flag">à¤…</span><span>Hindi source</span><Check size={13} /></div><div className="float-chip chip-target"><span className="chip-tamil">à®…</span><span>Tamil dub</span><AudioLines size={14} /></div><div className="float-chip chip-match"><div className="match-dot"><Check size={11} /></div><div><b>Dub transcript</b><small>Click to listen</small></div></div><div className="sparkle s-one">âœ³</div><div className="sparkle s-two">âœ¦</div></div><div className="hero-bottom-label">LANGUAGE IS THE BRIDGE <span>â€”</span> CLARITY IS THE PROMISE</div></section>

          <section className="metric-grid" aria-label="Workspace summary"><article className="metric-card"><div className="metric-top"><span className="metric-icon icon-violet"><FileText size={18} /></span><span className="metric-change">THIS WORKSPACE</span></div><div className="metric-number">{projects.length}</div><div className="metric-caption">Analysis projects</div></article><article className="metric-card"><div className="metric-top"><span className="metric-icon icon-coral"><ListChecks size={18} /></span><span className="metric-change alert-text">AI REVIEW</span></div><div className="metric-number">{projects.filter(p=>p.status==='Needs review').length}</div><div className="metric-caption">Projects needing review</div><div className="metric-progress"><span style={{width:projects.length ? `${Math.min(100,projects.filter(p=>p.status==='Needs review').length/projects.length*100)}%` : '0%'}} /></div><div className="metric-foot"><span>Review queue</span><span>{projects.length ? Math.round(projects.filter(p=>p.status==='Needs review').length/projects.length*100) : 0}%</span></div></article><article className="metric-card"><div className="metric-top"><span className="metric-icon icon-green"><Globe2 size={18} /></span><span className="metric-change">LANGUAGES</span></div><div className="metric-number">{new Set(projects.map(p=>p.target)).size}</div><div className="metric-caption">Target languages analyzed</div></article><article className="metric-card"><div className="metric-top"><span className="metric-icon icon-blue"><BadgeCheck size={18} /></span><span className="metric-change">PROVIDER</span></div><div className="metric-number" style={{fontSize:18,letterSpacing:'-.4px'}}>Sarvam AI</div><div className="metric-caption">Saaras v4 + Sarvam Translate</div></article></section>

          <section className="work-grid"><div className="projects-panel panel"><div className="panel-heading"><div><div className="section-kicker">YOUR WORKSPACE</div><h3>Recent projects <span className="heading-count">{projects.length}</span></h3></div><button className="text-action" onClick={() => setActiveTab('All projects')}>View all <ArrowRight size={14} /></button></div><div className="project-toolbar"><div className="tabs">{['All projects','Needs review','In progress','Ready'].map(tab => <button key={tab} className={cx('tab', activeTab===tab && 'tab-active')} onClick={() => setActiveTab(tab)}>{tab}{tab==='Needs review' && <i className="tab-dot"/>}</button>)}</div><div className="project-tools"><label className="search-box"><Search size={15}/><input placeholder="Search projects" value={query} onChange={e=>setQuery(e.target.value)} /></label><button className="filter-btn" onClick={() => setNotice('Showing the latest dubbing QA projects.')}><Filter size={14}/><span>Filter</span></button></div></div><div className="project-list">{visibleProjects.length ? visibleProjects.map((p,index)=><button className="project-row" key={`${p.title}-${index}`} onClick={()=>setDetails(p)}><div className={`project-thumb ${p.color}`}><span>{p.initials}</span><div className="thumb-play"><Play size={10} fill="currentColor"/></div></div><div className="project-name"><b>{p.title}</b><span>{p.source} <ArrowRight size={11}/> {p.target}<span className="project-dot">Â·</span>{p.date}</span></div><div className="project-score"><div className="outcome-mark"><Headphones size={15}/></div><span>Dub QA</span></div><div className="project-issues">{p.issues>0 ? <><span className={cx('issue-count',p.status==='Needs review'&&'issue-hot')}>{p.issues}</span><span>{p.issues===1?'flag':'flags'}</span></> : <><CheckCheck size={15}/><span>No flags</span></>}</div><div className="status-cell"><span className={cx('status-pill',p.status.toLowerCase().replace(' ','-'))}><i/>{p.status}</span></div><MoreHorizontal className="row-more" size={18}/></button>) : <div className="empty-state"><Search size={19}/><b>No matching projects</b><span>Try another search or choose a different view.</span></div>}</div><button className="list-footer" onClick={()=>setNotice('Youâ€™re viewing the latest projects in this workspace.')}>Showing {visibleProjects.length} of {projects.length} projects <ArrowDown size={13}/></button></div>

          <aside className="insight-column"><div className="review-panel panel"><div className="review-heading"><div><div className="section-kicker">AI AUDIO REVIEW</div><h3>Review queue <span className="queue-count">{projects.filter(p=>p.status==='Needs review').length}</span></h3></div><button className="icon-btn small" onClick={()=>setNotice('The queue is calculated from analyses run in this workspace.')} aria-label="Review options"><MoreHorizontal size={17}/></button></div><div className="review-sub">{projects.length ? 'AI detected possible issues in this dub. Open a finding to play its time range.' : 'Run an analysis to see real findings here.'}</div><div className="issue-list">{report?.findings.slice(0,3).map((issue,index)=><button key={`${issue.title}-${index}`} className="issue-row" onClick={()=>setDetails(projects[0] ?? null)}><div className={cx('severity-mark',issue.severity)}>{issue.severity==='critical'?<Zap size={14}/>:<Activity size={14}/>}</div><div className="issue-copy"><b>{issue.title}</b><span>{issue.detail}</span><small><Languages size={11}/> {report.targetLanguage} dub</small></div><ArrowRight className="issue-arrow" size={14}/></button>)}</div><button className="queue-link" onClick={()=>projects.length ? setDetails(projects[0]) : setModal(true)}>{projects.length ? 'Open latest report' : 'Start your first analysis'} <ArrowRight size={14}/></button></div>
          <div className="tip-card"><div className="tip-decoration"><div/><div/><div/></div><div className="tip-content"><div className="tip-kicker"><Heart size={12}/> A SMALL REMINDER</div><h4>AI listens to<br/>both languages.</h4><p>The AI listens to both tracks, compares what was said, and points you to the moments that may need fixing.</p><button onClick={()=>setNotice('Gemini compares the actual source and dubbed audio, then reports likely meaning and delivery issues with timestamps.')}>Our review philosophy <ArrowRight size={13}/></button></div></div></aside></section>

          <section className="workflow-strip"><div className="workflow-title"><div className="workflow-icon"><FlaskConical size={17}/></div><div><b>AI checks from audio to timestamped findings</b><span>Every suspected issue includes the moments the AI heard.</span></div></div><div className="workflow-steps"><div className="workflow-step"><span className="step-number">01</span><div><b>Transcribe independently</b><small>Listen to the dubbed audio</small></div></div><ArrowRight className="step-arrow" size={15}/><div className="workflow-step"><span className="step-number">02</span><div><b>Compare the meaning</b><small>Spot gaps and changed claims</small></div></div><ArrowRight className="step-arrow" size={15}/><div className="workflow-step"><span className="step-number">03</span><div><b>Open AI findings</b><small>Check flagged time ranges</small></div></div></div></section>
          <footer className="page-footer"><span>Made with care for every language <span className="footer-flower">âœ³</span></span><span>PRIVATE WORKSPACE <i/> LOCAL DEMO</span></footer>
        </div>
      </section>

      {notice && <div className="toast"><Check size={16}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}

      {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setModal(false);setOriginalFile(null);setDubbedFile(null)}}}><form className="create-modal" onSubmit={runAnalysis}>
        <button type="button" className="modal-close icon-btn" onClick={()=>!busy&&setModal(false)} aria-label="Close"><X size={18}/></button><div className="modal-icon"><Sparkles size={20}/></div><div className="section-kicker">SARVAM DUBBING + AI QUALITY REVIEW</div><h2>Analyze a dub</h2>
        <p className="modal-intro">Choose whether Sarvam should create the dub from your original or review a dub you already have.</p>
        <div className="workflow-choice"><button type="button" className={cx('workflow-option',generationMode==='sarvam'&&'workflow-option-active')} onClick={()=>setGenerationMode('sarvam')}><span className="workflow-option-icon"><WandSparkles size={16}/></span><span><b>Generate with Sarvam</b><small>Original → Sarvam dub → QA report</small></span><span className="workflow-radio"/></button><button type="button" className={cx('workflow-option',generationMode==='existing'&&'workflow-option-active')} onClick={()=>setGenerationMode('existing')}><span className="workflow-option-icon"><FileAudio size={16}/></span><span><b>I already have a dub</b><small>Upload both tracks → QA report</small></span><span className="workflow-radio"/></button></div>
        <label className="field-label">Project name <span>OPTIONAL</span><input className="text-input" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Mindful eating — Tamil dub" /></label>
        <div className="language-fields"><label className="field-label">Source language<select value={source} onChange={e=>setSource(e.target.value)}>{['Hindi','English','Marathi','Bengali','Gujarati','Tamil','Telugu','Kannada','Punjabi','Malayalam','Odia','Assamese','Urdu','Sanskrit','Nepali'].map(language=><option key={language}>{language}</option>)}</select></label><label className="field-label">Target language<select value={target} onChange={e=>setTarget(e.target.value)}>{languages.map(language=><option key={language}>{language}</option>)}</select></label></div>
        <div className="video-upload-grid"><label className="upload-box"><input type="file" accept="video/*,audio/*" onChange={e=>setOriginalFile(e.target.files?.[0] ?? null)}/><span className="upload-icon"><Upload size={19}/></span><b>{originalFile?.name || 'Choose original video'}</b><small>{originalFile ? `${(originalFile.size/1024/1024).toFixed(1)} MB · ready` : 'Source language audio/video'}</small><span className="upload-formats"><FileAudio size={12}/> MP4, MOV, MP3, WAV</span></label>
          {generationMode==='existing' && <label className="upload-box"><input type="file" accept="video/*,audio/*" onChange={e=>setDubbedFile(e.target.files?.[0] ?? null)}/><span className="upload-icon"><FileAudio size={19}/></span><b>{dubbedFile?.name || 'Choose dubbed video'}</b><small>{dubbedFile ? `${(dubbedFile.size/1024/1024).toFixed(1)} MB · ready` : 'Target language audio/video'}</small><span className="upload-formats"><FileAudio size={12}/> MP4, MOV, MP3, WAV</span></label>}
        </div>
        <div className="privacy-note"><ShieldCheck size={15}/><span>{generationMode==='sarvam' ? 'Sarvam receives the original and generates a target-language video dub (usage may be billed to your Sarvam account). The app then transcribes both and asks Gemini to compare the audio.' : 'Sarvam transcribes both videos; Gemini listens to both audio tracks and reports suspected meaning, pronunciation, pacing, and audio issues with timestamps.'}</span></div>
        {busy && <div className="analysis-progress" role="status" aria-live="polite"><div className="progress-heading"><b>{analysisProgress.stage || 'Preparing your analysis'}</b><span>{Math.min(100, analysisProgress.percent)}%</span></div><div className="progress-track" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={analysisProgress.percent}><span style={{width: `${analysisProgress.percent}%`}} /></div><div className="progress-meta"><span>Elapsed {formatDuration(elapsedSeconds)}</span><b>{remainingEstimate(estimatedRange, elapsedSeconds)}</b></div><small>Time is an estimate; Sarvam dubbing, transcription and AI review can take several minutes.</small></div>}
        <button className="primary-btn modal-submit" type="submit" disabled={busy}>{busy?<><span className="spinner"/> {generationMode==='sarvam'&&analysisProgress.percent<74?'Generating dub…':'AI listening & comparing…'}</>:<>{generationMode==='sarvam'?'Generate dub + run QA':'Run AI dub review'} <ArrowRight size={15}/></>}</button>
      </form></div>}      {details && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetails(null)}}><div className="detail-modal"><button className="modal-close icon-btn" onClick={()=>setDetails(null)} aria-label="Close"><X size={18}/></button><div className="detail-topline"><span className="eyebrow-line"/> DUB VIDEO QA REPORT <span className="status-pill needs-review"><i/>AI findings</span></div><h2>{details.title}</h2><p className="detail-language">{details.source} source <ArrowRight size={14}/> {details.target} dub <span>Â·</span> {details.date}</p>{report && reportVerdict && <div className="verdict-card"><div className="verdict-icon"><Headphones size={20}/></div><div><span className="section-kicker">WHAT THIS MEANS FOR YOUR DUB</span><h3>{reportVerdict.title}</h3><p>{reportVerdict.note}</p></div></div>}<div className="detail-explain"><ShieldCheck size={18}/><span>{report?.reviewComplete === false ? <>This review is incomplete and must not be read as a clean pass. {report.transcriptCrossCheckError ? `Transcript check: ${report.transcriptCrossCheckError}. ` : ""}{report.reviewCoverageWarnings?.join(" ")}</> : report?.transcriptCrossCheckAvailable ? 'Gemini checks both audio and transcript evidence. A cross-check label means both checks pointed to a similar phrase; this is stronger evidence, not proof.' : 'The transcript cross-check was unavailable, so findings rely on the audio review and basic transcript rules.'}</span></div><div className="detail-section-title"><b>Automated findings</b><span>{report?.findings.length ?? 0} flags</span></div>{(report?.findings ?? []).map((issue,index)=><div className="detail-issue" key={`${issue.title}-${index}`}><div className={cx('severity-mark',issue.severity)}>{issue.severity==='critical'?<Zap size={14}/>:<Activity size={14}/>}</div><div><b>{issue.title}</b><p>{issue.detail}</p>{(issue.sourceQuote || issue.dubQuote) && <div className="finding-phrases">{issue.sourceQuote && <span><b>Source phrase</b> {issue.sourceQuote}</span>}{issue.dubQuote && <span><b>Dub phrase heard</b> {issue.dubQuote}</span>}</div>}<small>{issue.category ?? issue.source ?? 'Transcript check'}{issue.evidenceStatus ? ` Â· ${issue.evidenceStatus === 'cross-checked' ? 'audio + transcript checks agree' : issue.evidenceStatus === 'audio-only' ? 'audio check only' : 'transcript check only'}` : ''}</small>{(issue.sourceStart!==undefined || issue.dubStart!==undefined) && <div className="finding-time-links">{issue.sourceStart!==undefined && <button onClick={()=>playSegment('source-review-video',issue.sourceStart!,issue.sourceEnd)}>Source {formatTime(issue.sourceStart)}{issue.sourceEnd!==undefined ? `â€“${formatTime(issue.sourceEnd)}` : ''} <Play size={11}/></button>}{issue.dubStart!==undefined && <button onClick={()=>playSegment('dub-review-video',issue.dubStart!,issue.dubEnd)}>Dub {formatTime(issue.dubStart)}{issue.dubEnd!==undefined ? `â€“${formatTime(issue.dubEnd)}` : ''} <Play size={11}/></button>}</div>}</div></div>)}{report && <><div className="audio-review-grid"><label><b>Original Â· {report.sourceLanguage}</b><video id="source-review-video" controls preload="metadata" src={report.originalVideoUrl}/></label><label><b>Dub Â· {report.targetLanguage}</b><video id="dub-review-video" controls preload="metadata" src={report.dubbedVideoUrl}/></label></div><div className="detail-section-title"><b>Dub transcript Â· timed playback</b><span>{report.dubbedSegments.length} timed segments</span></div><div className="segment-list">{report.dubbedSegments.length ? report.dubbedSegments.map((segment,index)=><button key={`${segment.start}-${index}`} className="segment-row" onClick={()=>playSegment('dub-review-video',segment.start,segment.end)}><span>{formatTime(segment.start)}</span><b>{segment.text}</b><Play size={13}/></button>) : <p className="no-timestamps">No timed speech segments were returned for this file. Use the video player above to navigate the dub; the recognized {report.targetLanguage} transcript is available below.</p>}</div><details className="transcript-details"><summary>Show transcript evidence (supporting evidence, not the verdict)</summary><div className="transcript-results"><div><b>Original transcript Â· {report.sourceLanguage}</b><p>{report.originalTranscript}</p></div><div><b>Dub transcript Â· {report.targetLanguage}</b><p>{report.dubbedTranscript}</p></div><div><b>Dub back-translated to {report.sourceLanguage}</b><p>{report.backTranslation}</p></div></div></details></>}<p className="report-disclaimer">{report?.disclaimer}</p>{report?.generatedBySarvam && report.dubbedVideoUrl && <a className="secondary-btn" href={report.dubbedVideoUrl} download={`${report.project.replace(/[^\w-]+/g, "-")}-${report.targetLanguage.toLowerCase()}-dub.mp4`}><ArrowDownToLine size={15}/> Download Sarvam dub</a>}<div className="detail-actions"><button className="secondary-btn" onClick={exportReport}><ArrowDownToLine size={15}/> Export JSON report</button><button className="primary-btn" onClick={()=>{setDetails(null)}}><Check size={15}/> Done</button></div></div></div>}
    </main>
  );
}
