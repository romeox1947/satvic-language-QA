'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPresigned } from '@vercel/blob/client';
import ProductDashboardShell from '@/features/dashboard/client/ProductDashboardShell';
import {
  Activity, AlertCircle, ArrowDown, ArrowDownToLine, ArrowRight, Check, CheckCheck,
  Clock3, FileAudio, Filter, ExternalLink, Headphones, Languages,
  MoreHorizontal, Pause, Pencil, Play, Plus, Search, ShieldCheck, Trash2,
  Upload, X, Zap,
} from 'lucide-react';

type Issue = { title: string; detail: string; time?: string; source?: string; severity: 'critical' | 'review' | 'info'; category?: string; sourceStart?: number; sourceEnd?: number; dubStart?: number; dubEnd?: number; evidenceStatus?: 'cross-checked' | 'audio-only' | 'transcript-only'; sourceQuote?: string; dubQuote?: string };
type Project = { title: string; source: string; target: string; status: 'Needs review' | 'In progress' | 'Ready' | 'Failed'; issues: number; date: string; color: string; initials: string; jobId?: string; completedSeconds?: number; errorMessage?: string };
type TranscriptSegment = { start: number; end: number; text: string; words?: { start: number; end: number; text: string }[] };
type AnalysisReport = { project: string; sourceLanguage: string; targetLanguage: string; createdAt: string; originalTranscript: string; dubbedTranscript: string; backTranslation: string; findings: Issue[]; disclaimer: string; originalSegments: TranscriptSegment[]; dubbedSegments: TranscriptSegment[]; timestampsAvailable: boolean; transcriptionEngine: string; semanticReviewEngine: string | null; transcriptCrossCheckAvailable: boolean; transcriptCrossCheckError?: string | null; audioReviewCompleted?: boolean; audioReviewEngine?: string; audioReviewFindingCount?: number; reviewCoverageWarnings?: string[]; reviewComplete?: boolean; generatedBySarvam?: boolean; originalVideoUrl?: string | null; dubbedVideoUrl?: string | null; originalB2Key?: string | null; dubbedB2Key?: string | null; reportB2Key?: string | null };
type Preflight = { fingerprint: string; geminiModel: string; cleanupNeeded: boolean; storage: { availableBytes: number; requiredBytes: number; cleanedBytes?: number }; limitations: string };

const initialProjects: Project[] = [];
const issues: Issue[] = [];

const languages = ['Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Bengali', 'Marathi', 'Punjabi', 'Malayalam', 'Hindi', 'English', 'Assamese', 'Odia'];
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const clipKey = (videoId: string, start: number, end?: number) => `${videoId}:${start}:${end ?? ''}`;
function quoteTimeRange(segments: TranscriptSegment[], phrase: string) {
  const terms = (phrase.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
  if (!terms.length || !segments.length) return null;
  let best: { score: number; segment: TranscriptSegment } | null = null;
  for (const segment of segments) {
    const text = segment.text.toLocaleLowerCase();
    const score = terms.filter(term => text.includes(term)).length / terms.length;
    if (!best || score > best.score) best = { score, segment };
  }
  return best && best.score >= 0.34 ? { start: best.segment.start, end: best.segment.end } : null;
}
function findingTimeRange(issue: Issue, segments: TranscriptSegment[], side: 'source' | 'dub') {
  const start = side === 'source' ? issue.sourceStart : issue.dubStart;
  const end = side === 'source' ? issue.sourceEnd : issue.dubEnd;
  if (issue.evidenceStatus === 'transcript-only') {
    const located = quoteTimeRange(segments, side === 'source' ? issue.sourceQuote || '' : issue.dubQuote || '');
    if (located) return located;
  }
  return { start, end };
}
const formatDuration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
const remainingEstimate = (range: { min: number; max: number } | null, elapsed: number) => {
  if (!range) return 'Estimating from video duration…';
  if (elapsed >= range.max) return 'Taking longer than the initial estimate';
  const min = Math.max(0, range.min - elapsed);
  const max = Math.max(0, range.max - elapsed);
  return `${formatDuration(min)}–${formatDuration(max)} estimated left`;
};

function SarvamLogoMark() {
  return <span className="sarvam-mark-wrap"><img className="sarvam-mark" src="https://web.sarvam.dev/assets/brand/guidelines/logomark-on-light.png" alt="" aria-hidden="true" /></span>;
}

async function readApiJson(response: Response): Promise<Record<string, any>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    if (response.status === 413 || /request entity too large|function_payload_too_large|payload too large/i.test(raw)) {
      throw new Error('Vercel rejected this video because the current upload path sends it through an API function, which has a 4.5 MB request limit. This deployment needs direct Vercel Blob uploads before it can accept normal video files.');
    }
    throw new Error(`The server returned a non-JSON response (HTTP ${response.status}): ${raw.slice(0, 180).replace(/\s+/g, ' ') || 'empty response'}`);
  }
}

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

export default function SatvicFluidDashboard({ initialAccountEmail = '' }: { initialAccountEmail?: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [accountEmail, setAccountEmail] = useState(initialAccountEmail);
  const [activeTab, setActiveTab] = useState('All projects');
  const [query, setQuery] = useState('');
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
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
  const [latestReport, setLatestReport] = useState<AnalysisReport | null>(null);
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [b2Configured, setB2Configured] = useState(false);
  const [archiveMenuOpen, setArchiveMenuOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [renameProjectOpen, setRenameProjectOpen] = useState(false);
  const [renameProjectValue, setRenameProjectValue] = useState('');
  const [renameProjectBusy, setRenameProjectBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ stage: '', percent: 0, status: 'idle' as 'idle' | 'processing' | 'complete' | 'error', startedAt: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedRange, setEstimatedRange] = useState<{ min: number; max: number } | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<'generate-sarvam' | 'start-review'>('generate-sarvam');
  const isSarvamWorkflow = activeWorkflow === 'generate-sarvam';
  const workflow = isSarvamWorkflow ? {
    eyebrow: 'GENERATE WITH SARVAM',
    title: 'Generate and review',
    steps: [
      ['Upload source', 'Choose video and language.'],
      ['Create dub', 'Sarvam generates target speech.'],
      ['Review audio', 'Check flagged moments.'],
      ['Export report', 'Download your findings.'],
    ],
    action: 'Generate with Sarvam',
  } : {
    eyebrow: 'START A REVIEW',
    title: 'Review an existing dub',
    steps: [
      ['Upload original', 'Choose the source language.'],
      ['Add existing dub', 'Select the target track.'],
      ['Review findings', 'Listen to flagged moments.'],
      ['Export report', 'Download the review.'],
    ],
    action: 'Start a review',
  };
  const workflowStepIcons = isSarvamWorkflow
    ? [Upload, Zap, Headphones, ArrowDownToLine]
    : [Upload, FileAudio, Activity, ArrowDownToLine];
  const openActiveWorkflow = () => {
    setGenerationMode(isSarvamWorkflow ? 'sarvam' : 'existing');
    setPreflight(null);
    setModal(true);
  };

  useEffect(() => {
    let active = true;
    fetch('/api/jobs/b2-status', { cache: 'no-store' }).then(response => response.json()).then(body => { if (active) setB2Configured(Boolean(body.configured)); }).catch(() => { if (active) setB2Configured(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshJobs = async () => {
      try {
        const response = await fetch('/api/jobs', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load account history.');
        if (!active) return;
        setAccountEmail(body.userEmail || '');
        const jobs = (body.jobs || []) as Array<{ id: string; run_id: string | null; project_name: string; source_language: string; target_language: string; created_at: string; updated_at?: string; status: string; issue_count?: number; error_message?: string | null }>;
        const updates = await Promise.all(jobs.filter(job => ['running', 'queued'].includes(job.status)).map(async job => {
          const response = await fetch(`/api/jobs/${encodeURIComponent(job.run_id || job.id)}`, { cache: 'no-store' });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) return job;
          if (body.status === 'completed' && body.report) return { ...job, status: 'completed', issue_count: body.report.findings?.length || 0 };
          if (body.status === 'failed') return { ...job, status: 'failed', error_message: body.error || job.error_message || 'Background workflow failed. Open the project for details.' };
          return job;
        }));
        if (!active) return;
        const latest = new Map(updates.map(job => [job.run_id || job.id, job]));
        const merged = jobs.map(job => latest.get(job.run_id || job.id) || job);
        setProjects(merged.map((job) => {
          const completionMs = job.updated_at ? Date.parse(job.updated_at) - Date.parse(job.created_at) : NaN;
          return { title: job.project_name, source: job.source_language, target: job.target_language, status: job.status === 'completed' ? (job.issue_count ? 'Needs review' : 'Ready') : job.status === 'failed' ? 'Failed' : 'In progress', issues: job.issue_count || 0, date: new Date(job.created_at).toLocaleDateString(), color: 'lilac', initials: job.project_name.slice(0, 2).toUpperCase(), jobId: job.run_id || job.id, completedSeconds: job.status === 'completed' && Number.isFinite(completionMs) && completionMs >= 0 ? Math.round(completionMs / 1000) : undefined, errorMessage: job.error_message || undefined };
        }));
      } catch { /* Keep the current dashboard visible if history is temporarily unavailable. */ }
    };
    void refreshJobs();
    const timer = window.setInterval(refreshJobs, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const runId = new URLSearchParams(window.location.search).get('qaRunId');
    if (!runId) return;
    const project = projects.find(item => item.jobId === runId);
    if (!project) return;
    setActiveWorkflow('start-review');
    setDetails(project);
    router.replace('/dashboard/satvic-fluid', { scroll: false });
  }, [projects, router]);

  useEffect(() => {
    if (!details?.jobId) return;
    let active = true;
    setReport(null);
    fetch(`/api/jobs/${encodeURIComponent(details.jobId)}`, { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.ok && body.report) setReport(body.report as AnalysisReport);
        else if (body.status === 'running') setNotice('This job is still running on the server. Check back here after it completes.');
        else if (body.status === 'failed' || !response.ok) setNotice(body.error || 'This job failed. Open Vercel Workflows to see the failure details.');
      })
      .catch(() => { if (active) setNotice('Could not load this job report. Check your connection and try again.'); });
    return () => { active = false; };
  }, [details?.jobId]);

  const visibleProjects = useMemo(() => projects.filter((p) => {
    const matchQuery = `${p.title} ${p.target} ${p.source}`.toLowerCase().includes(query.toLowerCase());
    const matchTab = activeTab === 'All projects' || (activeTab === 'Needs review' && p.status === 'Needs review') || (activeTab === 'In progress' && p.status === 'In progress') || (activeTab === 'Ready' && p.status === 'Ready') || (activeTab === 'Failed' && p.status === 'Failed');
    return matchQuery && matchTab;
  }), [projects, query, activeTab]);

  const latestFindingProject = projects.find(project => project.issues > 0 && project.jobId)
    ?? projects.find(project => project.status === 'Ready' && project.jobId)
    ?? null;

  useEffect(() => {
    if (!latestFindingProject?.jobId) {
      setLatestReport(null);
      return;
    }
    let active = true;
    setLatestReport(null);
    fetch(`/api/jobs/${encodeURIComponent(latestFindingProject.jobId)}`, { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (active && response.ok && body.report) setLatestReport(body.report as AnalysisReport);
      })
      .catch(() => { /* Keep the flag count visible if the report is temporarily unavailable. */ });
    return () => { active = false; };
  }, [latestFindingProject?.jobId]);

  const audioReviewSummary = !report?.audioReviewCompleted
    ? 'Audio review unavailable.'
    : report.reviewComplete === false
      ? 'Audio review incomplete; check the flagged timestamps below.'
      : (report.audioReviewFindingCount ?? 0) > 0
        ? `${report.audioReviewFindingCount} audio finding${report.audioReviewFindingCount === 1 ? '' : 's'}; check the timestamps below.`
        : report.findings.some(finding => finding.evidenceStatus === 'transcript-only')
          ? 'No direct audio findings; transcript flags are unconfirmed.'
          : 'No direct audio findings.';
  async function runAnalysis(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanProjectName = projectName.trim();
    if (!cleanProjectName) { setNotice('Enter a project name to continue.'); return; }
    if (!originalFile || (generationMode === 'existing' && !dubbedFile)) { setNotice(generationMode === 'sarvam' ? 'Select the original video to send to Sarvam.' : 'Select both the original and dubbed video to start QA.'); return; }
    if (generationMode === 'sarvam' && source === target) { setNotice('Choose a target language different from the source language.'); return; }
    const fingerprint = `${generationMode}:${originalFile.name}:${originalFile.size}:${dubbedFile?.name || ''}:${dubbedFile?.size || 0}:${source}:${target}`;
    if (!preflight || preflight.fingerprint !== fingerprint) {
      setBusy(true);
      setCheckingReadiness(true);
      try {
        const [originalDuration, dubDuration] = await Promise.all([readMediaDuration(originalFile), generationMode === 'existing' && dubbedFile ? readMediaDuration(dubbedFile) : Promise.resolve(0)]);
        const longest = Math.max(originalDuration, dubDuration);
        if (!longest) throw new Error('Could not read the media duration, so the QA size limit cannot be checked. Try MP4, MOV, MP3 or WAV with a readable duration. No upload or provider job was started.');
        if (longest > 0) setEstimatedRange({ min: Math.max(60, Math.round(longest * 0.45 + 45)), max: Math.max(180, Math.round(longest * 1.7 + 120)) });
        const response = await fetch('/api/jobs/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'inspect', mode: generationMode, originalBytes: originalFile.size, dubbedBytes: dubbedFile?.size || 0, durationSeconds: longest }) });
        const body = await readApiJson(response);
        if (!response.ok) throw new Error(body.error || 'Preflight could not confirm that this job is ready.');
        setPreflight({ fingerprint, geminiModel: body.geminiModel, cleanupNeeded: body.cleanupNeeded, storage: body.storage, limitations: body.limitations });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Preflight failed. No video was uploaded and no dubbing job was started.');
      } finally { setBusy(false); setCheckingReadiness(false); }
      return;
    }
    const progressId = crypto.randomUUID();
    const startedAt = Date.now();
    setBusy(true);
    setPreflight(null);
    setAnalysisProgress({ stage: 'Uploading videos to the local analyzer', percent: 3, status: 'processing', startedAt });
    setElapsedSeconds(0);
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
      setAnalysisProgress({ stage: 'Preparing storage and checking capacity again', percent: 2, status: 'processing', startedAt });
      const prepareResponse = await fetch('/api/jobs/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'prepare', mode: generationMode, originalBytes: originalFile.size, dubbedBytes: dubbedFile?.size || 0 }) });
      const prepareBody = await readApiJson(prepareResponse);
      if (!prepareResponse.ok) throw new Error(prepareBody.error || 'Storage preparation failed. No AI job was started.');
      if (prepareBody.cleanup) setNotice(prepareBody.cleanup);
      setPreflight(null);
      if (generationMode === 'sarvam') {
        setAnalysisProgress({ stage: 'Uploading video directly to secure server storage', percent: 4, status: 'processing', startedAt });
        const stored = await uploadPresigned(`satvic-jobs/${crypto.randomUUID()}-${originalFile.name.replace(/[^\w.-]+/g, '-')}`, originalFile, {
          access: 'private', handleUploadUrl: '/api/blob/upload', multipart: true,
          onUploadProgress: ({ percentage }) => setAnalysisProgress({ stage: `Uploading video to secure storage · ${Math.round(percentage)}%`, percent: Math.max(4, Math.round(percentage * 0.35)), status: 'processing', startedAt }),
        });
        setAnalysisProgress({ stage: 'Handing job to the server workflow', percent: 38, status: 'processing', startedAt });
        const startResponse = await fetch('/api/jobs/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originalBlobUrl: stored.url, originalName: originalFile.name, sourceLanguage: source, targetLanguage: target, projectName: cleanProjectName }) });
        const startBody = await readApiJson(startResponse);
        if (!startResponse.ok) throw new Error(startBody.error || 'Could not start the server-side dubbing job.');
        const title = cleanProjectName;
        const project: Project = { title, source, target, status: 'In progress', issues: 0, date: 'Just now', color: 'lilac', initials: title.slice(0, 2).toUpperCase(), jobId: startBody.runId };
        setProjects(previous => [project, ...previous]);
        setModal(false); setOriginalFile(null); setDubbedFile(null); setProjectName('');
        const backgroundLocation = startBody.runsOnVercel
          ? 'The job runs on Vercel, so you can close this browser or turn off your computer.'
          : 'This is a local run, so keep this computer and the development server running.';
        setNotice(startBody.emailNotificationsEnabled
          ? `Job started. ${backgroundLocation} We will email ${startBody.notificationEmail} when it completes or fails.`
          : `Job started. ${backgroundLocation} Reopen this dashboard later for the result. Configure Gmail app-password settings to receive start, success, and failure emails.`);
        window.setTimeout(() => setNotice(''), 12000);
        return;
      }
      if (!finalDub) throw new Error('No dubbed media is available for QA.');
      setAnalysisProgress({ stage: 'Uploading both private video tracks', percent: 8, status: 'processing', startedAt });
      const [originalStored, dubbedStored] = await Promise.all([
        uploadPresigned(`satvic-jobs/${crypto.randomUUID()}-${originalFile.name.replace(/[^\w.-]+/g, '-')}`, originalFile, { access: 'private', handleUploadUrl: '/api/blob/upload', multipart: true, onUploadProgress: ({ percentage }) => setAnalysisProgress({ stage: `Uploading original track · ${Math.round(percentage)}%`, percent: Math.max(8, Math.round(percentage * 0.22)), status: 'processing', startedAt }) }),
        uploadPresigned(`satvic-jobs/${crypto.randomUUID()}-${finalDub.name.replace(/[^\w.-]+/g, '-')}`, finalDub, { access: 'private', handleUploadUrl: '/api/blob/upload', multipart: true, onUploadProgress: ({ percentage }) => setAnalysisProgress({ stage: `Uploading dub track · ${Math.round(percentage)}%`, percent: Math.max(8, Math.round(percentage * 0.22)), status: 'processing', startedAt }) }),
      ]);
      const title = cleanProjectName;
      const jobResponse = await fetch('/api/jobs/manual', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originalBlobUrl: originalStored.url, dubbedBlobUrl: dubbedStored.url, originalName: originalFile.name, sourceLanguage: source, targetLanguage: target, projectName: title }) });
      const jobBody = await readApiJson(jobResponse);
      if (!jobResponse.ok) throw new Error(jobBody.error || 'Could not save this analysis to your history.');
      setAnalysisProgress({ stage: 'Transcribing and comparing both audio tracks', percent: 38, status: 'processing', startedAt });
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originalBlobUrl: originalStored.url, dubbedBlobUrl: dubbedStored.url, originalName: originalFile.name, sourceLanguage: source, targetLanguage: target, projectName: title, historyJobId: jobBody.jobId, progressId }) });
      const body = await readApiJson(response);
      if (!response.ok) throw new Error(body.error || 'Analysis failed.');
      const result = body as AnalysisReport;
      result.originalVideoUrl = `/api/jobs/media?runId=${encodeURIComponent(jobBody.jobId)}&url=${encodeURIComponent(originalStored.url)}`;
      result.dubbedVideoUrl = `/api/jobs/media?runId=${encodeURIComponent(jobBody.jobId)}&url=${encodeURIComponent(dubbedStored.url)}`;
      result.generatedBySarvam = false;
      const project: Project = { title: result.project || title, source, target, status: 'Needs review', issues: result.findings.length, date: 'Just now', color: 'lilac', initials: title.slice(0, 2).toUpperCase(), jobId: jobBody.jobId };
      setReport(result); setLatestReport(result); setProjects((prev) => [project, ...prev]); setDetails(project);
      setModal(false); setOriginalFile(null); setDubbedFile(null); setProjectName(''); setNotice('AI listened to both audio tracks. Open the report for timestamped findings.');
      window.setTimeout(() => setNotice(''), 4500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Analysis failed. Check your API setup and try again.');
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

  async function archiveFullReportToB2() {
    setArchiveMenuOpen(false);
    const jobId = details?.jobId;
    if (!jobId || !report?.dubbedVideoUrl) { setNotice('There is no completed dubbed output to archive.'); return; }
    if (!b2Configured) { setNotice('Backblaze B2 is not configured on this deployment. Add its credentials to the server environment and redeploy.'); return; }
    if (!window.confirm('Archive the complete QA report, source video, and dubbed video in private Backblaze B2? After all three objects and their keys are saved, Satvic Studio will delete their Vercel Blob copies.')) return;
    setArchiveBusy(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/b2`, { method: 'POST' });
      const body = await readApiJson(response);
      if (!response.ok) throw new Error(body.error || 'Could not archive this report in Backblaze B2.');
      const mediaPath = `/api/jobs/${encodeURIComponent(jobId)}/b2/media`;
      setReport(current => current ? { ...current, originalVideoUrl: `${mediaPath}?track=source`, dubbedVideoUrl: `${mediaPath}?track=dub`, originalB2Key: body.originalB2Key, dubbedB2Key: body.dubbedB2Key, reportB2Key: body.reportB2Key } : current);
      setNotice(body.warning || (body.vercelCopyDeleted ? 'The complete report and both videos are saved in private Backblaze B2. Their Vercel Blob copies were deleted.' : 'The complete report and both videos are saved in Backblaze B2. Vercel cleanup did not finish; the report is still safe in Backblaze B2.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the complete archive to Backblaze B2. The Vercel copies were kept.');
    } finally { setArchiveBusy(false); }
  }

  async function saveProjectName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const jobId = details?.jobId;
    const projectName = renameProjectValue.trim();
    if (!jobId) { setNotice('This project cannot be renamed because its job ID is unavailable.'); return; }
    if (!projectName) { setNotice('Enter a project name before saving.'); return; }
    if (projectName.length > 120) { setNotice('Project names must be 120 characters or fewer.'); return; }

    setRenameProjectBusy(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectName }),
      });
      const body = await readApiJson(response);
      if (!response.ok) throw new Error(body.error || 'Could not rename this project.');
      const savedName = typeof body.projectName === 'string' ? body.projectName : projectName;
      setProjects(current => current.map(project => project.jobId === jobId
        ? { ...project, title: savedName, initials: savedName.slice(0, 2).toUpperCase() }
        : project));
      setDetails(current => current?.jobId === jobId ? { ...current, title: savedName, initials: savedName.slice(0, 2).toUpperCase() } : current);
      setReport(current => current ? { ...current, project: savedName } : current);
      setLatestReport(current => current ? { ...current, project: savedName } : current);
      setRenameProjectOpen(false);
      setNotice('Project renamed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not rename this project.');
    } finally {
      setRenameProjectBusy(false);
    }
  }

  async function deleteProject(project: Project) {
    if (!project.jobId) { setNotice('This project cannot be deleted because its job ID is unavailable.'); return; }
    setDeletingProjectId(project.jobId);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(project.jobId)}`, { method: 'DELETE' });
      const body = await readApiJson(response);
      if (!response.ok) throw new Error(body.error || 'Could not delete this project.');
      setProjects(current => current.filter(item => item.jobId !== project.jobId));
      setDetails(current => current?.jobId === project.jobId ? null : current);
      setProjectMenuId(null);
      setDeleteConfirmId(null);
      setNotice(`Deleted “${project.title}”.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete this project.');
    } finally {
      setDeletingProjectId(null);
    }
  }

  function playSegment(videoId: string, seconds: number, endSeconds?: number, includeContext = false) {
    const video = document.getElementById(videoId) as HTMLVideoElement | null;
    if (!video) return;
    const requestId = String(Number(video.dataset.reviewRequest || 0) + 1);
    video.dataset.reviewRequest = requestId;
    const rangeKey = clipKey(videoId, seconds, endSeconds);
    const playbackStart = includeContext ? Math.max(0, seconds - 10) : seconds;
    const requestedEnd = endSeconds ?? seconds;
    const playbackEnd = includeContext ? requestedEnd + 10 : endSeconds;
    if (video.dataset.reviewRange === rangeKey && (!video.paused || video.seeking)) {
      video.dataset.reviewRequest = String(Number(requestId) + 1);
      video.pause();
      video.ontimeupdate = null;
      setPlayingClip(null);
      return;
    }
    document.querySelectorAll<HTMLVideoElement>('.audio-review-grid video').forEach(other => {
      if (other !== video) {
        other.dataset.reviewRequest = String(Number(other.dataset.reviewRequest || 0) + 1);
        other.pause();
        other.ontimeupdate = null;
      }
    });
    video.pause();
    video.ontimeupdate = null;
    video.dataset.reviewRange = rangeKey;
    setPlayingClip(rangeKey);
    const startPlayback = async () => {
      try {
        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Video metadata did not load.')); }, 8000);
            const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener('loadedmetadata', loaded); video.removeEventListener('error', failed); };
            const loaded = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error('Video could not be loaded.')); };
            video.addEventListener('loadedmetadata', loaded, { once: true });
            video.addEventListener('error', failed, { once: true });
          });
        }
        if (video.dataset.reviewRequest !== requestId) return;
        const target = Math.max(0, Math.min(playbackStart, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : playbackStart));
        let seeked: Promise<void> = Promise.resolve();
        if (Math.abs(video.currentTime - target) > 0.08) {
          seeked = new Promise<void>((resolve, reject) => {
            const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener('seeked', onSeeked); };
            const timeout = window.setTimeout(() => {
              cleanup();
              Math.abs(video.currentTime - target) <= 0.75
                ? resolve()
                : reject(new Error('The video did not seek to the selected finding.'));
            }, 5000);
            const onSeeked = () => { cleanup(); resolve(); };
            video.addEventListener('seeked', onSeeked, { once: true });
          });
          video.currentTime = target;
        }
        if (video.dataset.reviewRequest !== requestId) return;
        const stopAt = playbackEnd === undefined ? undefined : Math.min(playbackEnd, Number.isFinite(video.duration) ? Math.max(target, video.duration - 0.05) : playbackEnd);
        if (stopAt !== undefined && stopAt > target) {
          video.ontimeupdate = () => {
            if (video.currentTime >= stopAt) {
              video.pause();
              video.ontimeupdate = null;
              setPlayingClip(current => current === rangeKey ? null : current);
            }
          };
        }
        // Call play in the click gesture before awaiting the seek, so browser
        // autoplay policies do not reject playback after the asynchronous seek.
        await Promise.all([seeked, video.play()]);
        if (video.dataset.reviewRequest !== requestId) return;
        if (Math.abs(video.currentTime - target) > 0.75) throw new Error('The video did not reach the selected finding time.');
      } catch (error) {
        if (video.dataset.reviewRequest !== requestId) return;
        video.pause();
        video.ontimeupdate = null;
        setPlayingClip(null);
        const reason = error instanceof Error ? error.message : 'Unknown playback error.';
        setNotice(`Could not play this clip: ${reason}`);
      }
    };
    void startPlayback();
  }

  return (
    <ProductDashboardShell
      productId="satvic-fluid"
      accountEmail={accountEmail}
      onNotice={setNotice}
      initialFeatureId="generate-sarvam"
      onFeatureSelect={(featureId) => setActiveWorkflow(featureId as 'generate-sarvam' | 'start-review')}
    >
      <section className="welcome-row"><div><h1>{isSarvamWorkflow ? 'Generate with Sarvam' : 'Start a review'}</h1><p className="welcome-subtitle">{isSarvamWorkflow ? 'Create a dub in your target language, then review it.' : 'Compare an existing dub with its original.'}</p></div><button className="primary-btn" onClick={openActiveWorkflow}>{isSarvamWorkflow ? <SarvamLogoMark/> : <FileAudio size={17}/>} {workflow.action}</button></section>



      <section className="qa-flow" aria-labelledby="qa-flow-title"><div className="qa-flow-heading"><div className="qa-flow-title"><span className={`qa-flow-brand${isSarvamWorkflow ? ' sarvam' : ' review'}`}>{isSarvamWorkflow ? <SarvamLogoMark/> : <FileAudio size={19}/>}</span><div><div className="section-kicker">{workflow.eyebrow}</div><h2 id="qa-flow-title">{workflow.title}</h2></div></div><span className="qa-flow-time"><Clock3 size={15}/> 4 steps</span></div><ol className="qa-flow-steps">{workflow.steps.map(([title,description],index)=>{const StepIcon=workflowStepIcons[index];return <li key={title}><span className="qa-step-number">0{index+1}</span><span className="qa-step-icon" aria-hidden="true"><StepIcon size={15}/></span><div><b>{title}</b><p>{description}</p></div></li>})}</ol><button className="qa-flow-action" onClick={openActiveWorkflow}>{isSarvamWorkflow ? <SarvamLogoMark/> : <FileAudio size={16}/>} Open upload <ArrowRight size={15}/></button></section>

          <section className="work-grid"><div className="projects-panel panel"><div className="panel-heading"><div><div className="section-kicker">YOUR WORKSPACE</div><h3>Recent projects <span className="heading-count">{projects.length}</span></h3></div><button className="text-action" onClick={() => setActiveTab('All projects')}>View all <ArrowRight size={14} /></button></div><div className="project-toolbar"><div className="tabs">{['All projects','Needs review','In progress','Ready','Failed'].map(tab => <button key={tab} className={cx('tab', activeTab===tab && 'tab-active')} onClick={() => setActiveTab(tab)}>{tab}{tab==='Needs review' && <i className="tab-dot"/>}</button>)}</div><div className="project-tools"><label className="search-box"><Search size={15}/><input placeholder="Search projects" value={query} onChange={e=>setQuery(e.target.value)} /></label><button className="filter-btn" onClick={() => setNotice('Showing the latest dubbing QA projects.')}><Filter size={14}/><span>Filter</span></button></div></div><div className="project-list">{visibleProjects.length ? visibleProjects.map((p,index)=><div className="project-row" key={`${p.title}-${index}`} role="group" aria-label={`Project ${p.title}`} onClick={()=>{setProjectMenuId(null);setDetails(p)}}><div className={`project-thumb ${p.color}`}><span>{p.initials}</span><div className="thumb-play"><Play size={10} fill="currentColor"/></div></div><div className="project-name"><button type="button" className="project-open" onClick={event=>{event.stopPropagation();setProjectMenuId(null);setDetails(p)}}><b>{p.title}</b></button><span>{p.source} <ArrowRight size={11}/> {p.target}<span className="project-dot">·</span>{p.date}</span></div><div className="project-score"><div className={cx("outcome-mark",p.status==='Failed'&&'failed')}>{p.status==='Failed'?<AlertCircle size={15}/>:<Clock3 size={15}/>}</div><span>{p.completedSeconds !== undefined ? `Completed in ${formatDuration(p.completedSeconds)}` : p.status === 'Failed' ? 'Dubbing failed' : p.status === 'In progress' ? 'Processing' : 'Time unavailable'}</span></div><div className={cx("project-issues",p.status==='Failed'&&'failed')}>{p.status==='Failed' ? <><AlertCircle size={14}/><span>Failed</span></> : p.issues>0 ? <><span className={cx('issue-count',p.status==='Needs review'&&'issue-hot')}>{p.issues}</span><span>{p.issues===1?'flag':'flags'}</span></> : <><CheckCheck size={15}/><span>No flags</span></>}</div><div className="status-cell"><span className={cx('status-pill',p.status.toLowerCase().replace(' ','-'))}><i/>{p.status}</span></div><div className="project-actions" onClick={event=>event.stopPropagation()}><button type="button" className="row-more" aria-label={`Actions for ${p.title}`} aria-expanded={projectMenuId===p.jobId} onClick={()=>{setProjectMenuId(projectMenuId===p.jobId?null:p.jobId??null);setDeleteConfirmId(null)}}><MoreHorizontal size={18}/></button>{projectMenuId===p.jobId && <div className="project-actions-menu">{deleteConfirmId===p.jobId ? <><p>Delete this project and its stored files?</p><button type="button" className="project-delete-confirm" disabled={deletingProjectId===p.jobId} onClick={()=>void deleteProject(p)}>{deletingProjectId===p.jobId?'Deleting...':'Confirm delete'}</button><button type="button" onClick={()=>{setDeleteConfirmId(null);setProjectMenuId(null)}}>Cancel</button></> : <button type="button" className="project-delete-option" onClick={()=>setDeleteConfirmId(p.jobId??null)}><Trash2 size={14}/>Delete project</button>}</div>}</div></div>) : <div className="empty-state"><Search size={19}/><b>No matching projects</b><span>Try another search or choose a different view.</span></div>}</div><button className="list-footer" onClick={()=>setNotice('You’re viewing the latest projects in this workspace.')}>Showing {visibleProjects.length} of {projects.length} projects <ArrowDown size={13}/></button></div>

          <aside className="insight-column"><section className="review-panel panel"><div className="review-heading"><div className="section-kicker">LATEST FINDINGS</div><span className="queue-count">{latestReport?.findings.length || latestFindingProject?.issues || 0}</span></div>{latestReport?.findings.length ? <div className="review-latest">{latestReport.findings.slice(0,3).map((issue,index)=><button key={`${issue.title}-${index}`} className="issue-row" onClick={()=>setDetails(latestFindingProject)}><span className={cx('severity-mark',issue.severity)}>{issue.severity==='critical'?<Zap size={14}/>:<Activity size={14}/>}</span><span className="issue-copy"><b>{issue.title}</b><span>{issue.detail}</span><small><Languages size={11}/> {latestReport.targetLanguage} dub</small></span><ArrowRight className="issue-arrow" size={14}/></button>)}</div> : latestFindingProject ? <div className="review-empty"><b>{latestFindingProject.issues} flagged {latestFindingProject.issues === 1 ? 'finding' : 'findings'}</b><span>Open the latest report to see the flagged moments.</span></div> : <div className="review-empty"><b>No findings yet</b><span>Start either workflow to create a report here.</span></div>}<button className="queue-link" onClick={()=>latestFindingProject ? setDetails(latestFindingProject) : projects.length ? setDetails(projects[0]) : openActiveWorkflow()}>{latestFindingProject || projects.length ? 'Open latest report' : 'Start this workflow'} <ArrowRight size={14}/></button></section></aside></section>



      {notice && <div className="toast"><Check size={16}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}

      {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setModal(false);setOriginalFile(null);setDubbedFile(null);setPreflight(null)}}}><form className="create-modal" onSubmit={runAnalysis}>
        <button type="button" className="modal-close icon-btn" onClick={()=>{if(!busy){setModal(false);setOriginalFile(null);setDubbedFile(null);setPreflight(null)}}} aria-label="Close"><X size={18}/></button><div className="section-kicker">SARVAM DUBBING + AI QUALITY REVIEW</div><h2>{generationMode === 'sarvam' ? 'Generate a dub with Sarvam' : 'Review an existing dub'}</h2>
        <p className="modal-intro">{generationMode === 'sarvam' ? 'Upload your source video and choose the language for the Sarvam dub.' : 'Upload the original video and the dubbed version you want to review.'}</p>

        <label className="field-label">Project name <span>REQUIRED</span><input className="text-input" value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. Mindful eating — Tamil dub" required aria-required="true" /></label>
        <div className="language-fields"><label className="field-label">Source language<select value={source} onChange={e=>setSource(e.target.value)}>{['Hindi','English','Marathi','Bengali','Gujarati','Tamil','Telugu','Kannada','Punjabi','Malayalam','Odia','Assamese','Urdu','Sanskrit','Nepali'].map(language=><option key={language}>{language}</option>)}</select></label><label className="field-label">Target language<select value={target} onChange={e=>setTarget(e.target.value)}>{languages.map(language=><option key={language}>{language}</option>)}</select></label></div>
        <div className="video-upload-grid"><label className="upload-box"><input type="file" accept="video/*,audio/*" onChange={e=>{setOriginalFile(e.target.files?.[0] ?? null);setPreflight(null)}}/><span className="upload-icon"><Upload size={19}/></span><b>{originalFile?.name || 'Choose original video'}</b><small>{originalFile ? `${(originalFile.size/1024/1024).toFixed(1)} MB · ready` : 'Source language audio/video'}</small><span className="upload-formats"><FileAudio size={12}/> MP4, MOV, MP3, WAV</span></label>
          {generationMode==='existing' && <label className="upload-box"><input type="file" accept="video/*,audio/*" onChange={e=>{setDubbedFile(e.target.files?.[0] ?? null);setPreflight(null)}}/><span className="upload-icon"><FileAudio size={19}/></span><b>{dubbedFile?.name || 'Choose dubbed video'}</b><small>{dubbedFile ? `${(dubbedFile.size/1024/1024).toFixed(1)} MB · ready` : 'Target language audio/video'}</small><span className="upload-formats"><FileAudio size={12}/> MP4, MOV, MP3, WAV</span></label>}
        </div>
        <div className="privacy-note"><ShieldCheck size={15}/><span>{generationMode==='sarvam' ? 'Sarvam receives the original and generates a target-language video dub (usage may be billed to your Sarvam account). The app then transcribes both and asks Gemini to compare the audio.' : 'Sarvam transcribes both videos; Gemini listens to both audio tracks and reports suspected meaning, pronunciation, pacing, and audio issues with timestamps.'}</span></div>
        {preflight && <div className="preflight-card" role="status"><b>Ready check passed · {preflight.geminiModel} responded</b><span>Estimated Blob space needed: {(preflight.storage.requiredBytes/1024/1024).toFixed(1)} MB including reserve. Available: {(preflight.storage.availableBytes/1024/1024).toFixed(1)} MB.</span>{preflight.cleanupNeeded ? <span className="preflight-warning">To make room, confirmation will delete inactive video/audio files from earlier jobs. Reports and active jobs are kept; old video playback/download links will stop working.</span> : <span>No old media needs to be cleared.</span>}<small>{preflight.limitations} This check uses a small Gemini request; Sarvam credits are not checked or reserved. Check Sarvam Dashboard → Billing before confirming.</small></div>}
        {busy && !checkingReadiness && <div className="analysis-progress" role="status" aria-live="polite"><div className="progress-heading"><b>{analysisProgress.stage || 'Preparing your analysis'}</b><span>{Math.min(100, analysisProgress.percent)}%</span></div><div className="progress-track" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={analysisProgress.percent}><span style={{width: `${analysisProgress.percent}%`}} /></div><div className="progress-meta"><span>Elapsed {formatDuration(elapsedSeconds)}</span><b>{remainingEstimate(estimatedRange, elapsedSeconds)}</b></div><small>Time is an estimate; Sarvam dubbing, transcription and AI review can take several minutes.</small></div>}
        <button className="primary-btn modal-submit" type="submit" disabled={busy}>{busy?<><span className="spinner"/> {checkingReadiness?'Checking providers…':analysisProgress.stage?.toLowerCase().includes('storage')?'Checking storage…':generationMode==='sarvam'&&analysisProgress.percent<74?'Preparing / generating dub…':'AI listening & comparing…'}</>:<>{preflight ? (preflight.cleanupNeeded ? 'Clear old media & start' : 'Confirm & start job') : 'Check readiness first'} <ArrowRight size={15}/></>}</button>
      </form></div>}      {details && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDetails(null)}}><div className="detail-modal"><button className="modal-close icon-btn" onClick={()=>setDetails(null)} aria-label="Close"><X size={18}/></button><div className="detail-topline"><span className="eyebrow-line"/> DUB VIDEO QA REPORT <span className={`status-pill${details.status==='Failed' ? ' failed' : report?.findings.length ? ' needs-review' : ' ready'}`}><i/>{details.status==='Failed' ? 'Failed' : report ? report.findings.length ? `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'}` : 'No findings' : 'Loading report'}</span><div className="archive-actions"><button type="button" className="icon-btn" aria-label="Dub output actions" aria-expanded={archiveMenuOpen} onClick={()=>setArchiveMenuOpen(open=>!open)}><MoreHorizontal size={18}/></button>{archiveMenuOpen && <div className="archive-dropdown"><button type="button" onClick={()=>{setRenameProjectValue(details.title);setRenameProjectOpen(true);setArchiveMenuOpen(false)}}><Pencil size={14}/>Rename project</button>{report?.dubbedVideoUrl && <button type="button" onClick={archiveFullReportToB2} disabled={archiveBusy}><ExternalLink size={14}/>{archiveBusy ? 'Saving full report...' : report?.reportB2Key ? 'Ensure Backblaze B2 archive & clear Vercel' : b2Configured ? 'Archive full report to Backblaze B2 & clear Vercel' : 'Archive full report to Backblaze B2'}</button>}{!report?.dubbedVideoUrl && <span>No dubbed output is available.</span>}</div>}</div></div>{renameProjectOpen ? <form className="rename-project-form" onSubmit={saveProjectName}><label><span>Project name</span><input value={renameProjectValue} onChange={event=>setRenameProjectValue(event.target.value)} maxLength={120} required autoFocus /></label><div><button type="submit" disabled={renameProjectBusy}>{renameProjectBusy ? 'Saving…' : 'Save name'}</button><button type="button" onClick={()=>setRenameProjectOpen(false)} disabled={renameProjectBusy}>Cancel</button></div></form> : <h2>{details.title}</h2>}<p className="detail-language">{details.source} source <ArrowRight size={14}/> {details.target} dub <span>·</span> {details.date}</p>{details.status!=='Failed' && <div className="detail-explain"><span>{audioReviewSummary}</span></div>}<div className="detail-section-title"><b>{details.status==='Failed'?'Job failed':'Automated findings'}</b><span>{details.status==='Failed'?'QA report unavailable':`${report?.findings.length ?? 0} flags`}</span></div>{details.status==='Failed' && <div className="job-failure" role="alert"><AlertCircle size={18}/><div><b>The dubbing job did not complete</b><p>{details.errorMessage || 'Open the project to load the failure details.'}</p></div></div>}{(report?.findings ?? []).map((issue,index)=><div className="detail-issue" key={`${issue.title}-${index}`}><div className={cx('severity-mark',issue.severity)}>{issue.severity==='critical'?<Zap size={14}/>:<Activity size={14}/>}</div><div><b>{issue.title}</b><p>{issue.detail}</p>{(issue.sourceQuote || issue.dubQuote) && <div className="finding-phrases">{issue.sourceQuote && <span><b>Source phrase</b> {issue.sourceQuote}</span>}{issue.dubQuote && <span><b>Dub phrase heard</b> {issue.dubQuote}</span>}</div>}<small>{issue.category ?? issue.source ?? 'Transcript check'}{issue.source && issue.category ? ` | ${issue.source}` : ''}{issue.evidenceStatus ? ` · ${issue.evidenceStatus === 'cross-checked' ? 'audio + transcript checks agree' : issue.evidenceStatus === 'audio-only' ? 'audio check only' : 'text-only; not audio-confirmed'}` : ''}</small>{(findingTimeRange(issue,report?.originalSegments ?? [],'source').start!==undefined || findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!==undefined) && <div className="finding-time-links">{findingTimeRange(issue,report?.originalSegments ?? [],'source').start!==undefined && <button title="Plays from 10 seconds before to 10 seconds after this finding" aria-label={playingClip === clipKey('source-review-video',findingTimeRange(issue,report?.originalSegments ?? [],'source').start!,findingTimeRange(issue,report?.originalSegments ?? [],'source').end) ? 'Pause source clip' : 'Play source clip'} onClick={()=>playSegment('source-review-video',findingTimeRange(issue,report?.originalSegments ?? [],'source').start!,findingTimeRange(issue,report?.originalSegments ?? [],'source').end,true)}>Source {issue.evidenceStatus === 'transcript-only' ? '~' : ''}{formatTime(findingTimeRange(issue,report?.originalSegments ?? [],'source').start!)}{issue.sourceEnd!==undefined ? `–${formatTime(findingTimeRange(issue,report?.originalSegments ?? [],'source').end!)}` : ''} {playingClip === clipKey('source-review-video',findingTimeRange(issue,report?.originalSegments ?? [],'source').start!,findingTimeRange(issue,report?.originalSegments ?? [],'source').end) ? <Pause size={11}/> : <Play size={11}/>}</button>}{findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!==undefined && <button title="Plays from 10 seconds before to 10 seconds after this finding" aria-label={playingClip === clipKey('dub-review-video',findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!,findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end) ? 'Pause dub clip' : 'Play dub clip'} onClick={()=>playSegment('dub-review-video',findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!,findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end,true)}>Dub {issue.evidenceStatus === 'transcript-only' ? '~' : ''}{formatTime(findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!)}{issue.dubEnd!==undefined ? `–${formatTime(findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end!)}` : ''} {playingClip === clipKey('dub-review-video',findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!,findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end) ? <Pause size={11}/> : <Play size={11}/>}</button>}</div>}</div></div>)}{report && <><div className="audio-review-grid"><label><b>Original · {report.sourceLanguage}</b><video id="source-review-video" controls preload="metadata" src={report.originalVideoUrl ?? undefined} onPause={()=>setPlayingClip(null)} /></label>{report.dubbedVideoUrl ? <label><b>Dub &middot; {report.targetLanguage}</b><video id="dub-review-video" controls preload="metadata" src={report.dubbedVideoUrl ?? undefined} onPause={()=>setPlayingClip(null)} /></label> : <p className="no-timestamps">Dub media is no longer available.</p>}</div><details className="transcript-details"><summary>Show transcript evidence (supporting evidence, not the verdict)</summary><div className="transcript-results"><div><b>Original transcript · {report.sourceLanguage}</b><p>{report.originalTranscript}</p></div><div><b>Dub transcript · {report.targetLanguage}</b><p>{report.dubbedTranscript}</p></div><div><b>Dub back-translated to {report.sourceLanguage}</b><p>{report.backTranslation}</p></div></div></details></>}<div className="detail-actions">{report?.generatedBySarvam && report.dubbedVideoUrl && <a className="secondary-btn" href={report.dubbedVideoUrl} download={`${report.project.replace(/[^\w-]+/g, "-")}-${report.targetLanguage.toLowerCase()}-dub.mp4`}><ArrowDownToLine size={15}/> Download Sarvam dub</a>}{report?.dubbedVideoUrl && <button className="secondary-btn" onClick={archiveFullReportToB2} disabled={archiveBusy}><ExternalLink size={15}/>{archiveBusy ? 'Saving to Backblaze B2...' : report?.reportB2Key ? 'Ensure Backblaze B2 archive & clear Vercel' : b2Configured ? 'Archive full report to Backblaze B2' : 'Archive full report to Backblaze B2'}</button>}<button className="secondary-btn" onClick={exportReport}><ArrowDownToLine size={15}/> Export JSON report</button><button className="primary-btn" onClick={()=>{setDetails(null)}}><Check size={15}/> Done</button></div></div></div>}
    </ProductDashboardShell>
  );
}
