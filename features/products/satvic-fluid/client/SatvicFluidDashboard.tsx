'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { uploadPresigned } from '@vercel/blob/client';
import ProductDashboardShell from '@/features/dashboard/client/ProductDashboardShell';
import IndiaCommunityMapCard, { languagesForIndiaState } from '@/features/dashboard/client/IndiaCommunityMapCard';
import FeedbackCalendarCard from '@/features/dashboard/client/FeedbackCalendarCard';
import {
  Activity, AlertCircle, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, Calculator, Check, CheckCheck,
  Clock3, FileAudio, FileText, ExternalLink, Folder, FolderPlus, FolderOpen, Headphones, Languages,
  LoaderCircle, MoreHorizontal, Pause, Pencil, Play, Plus, Search, ShieldCheck, Trash2,
  Upload, X, Zap,
} from 'lucide-react';

type Issue = { title: string; detail: string; time?: string; source?: string; severity: 'critical' | 'review' | 'info'; category?: string; sourceStart?: number; sourceEnd?: number; dubStart?: number; dubEnd?: number; evidenceStatus?: 'cross-checked' | 'audio-only' | 'transcript-only'; sourceQuote?: string; dubQuote?: string };
type Project = { title: string; source: string; target: string; status: 'Needs review' | 'In progress' | 'Ready' | 'Failed' | 'Example'; issues: number; date: string; createdAt?: string; color: string; initials: string; jobId?: string; folderId?: string; completedSeconds?: number; sourceDurationSeconds?: number; workflowMode?: 'sarvam' | 'review'; errorMessage?: string; originalVideoUrl?: string | null; dubbedVideoUrl?: string | null; dubbedAvailable?: boolean; isExample?: boolean };
type ProjectFolder = { id: string; name: string; created_at: string; feedback_form_url?: string | null; feedback_sheet_url?: string | null };
type TranscriptSegment = { start: number; end: number; text: string; words?: { start: number; end: number; text: string }[] };
type AnalysisReport = { project: string; sourceLanguage: string; targetLanguage: string; createdAt: string; originalTranscript: string; dubbedTranscript: string; backTranslation: string; findings: Issue[]; disclaimer: string; originalSegments: TranscriptSegment[]; dubbedSegments: TranscriptSegment[]; timestampsAvailable: boolean; transcriptionEngine: string; semanticReviewEngine: string | null; transcriptCrossCheckAvailable: boolean; transcriptCrossCheckError?: string | null; audioReviewCompleted?: boolean; audioReviewEngine?: string; audioReviewFindingCount?: number; reviewCoverageWarnings?: string[]; reviewComplete?: boolean; generatedBySarvam?: boolean; originalVideoUrl?: string | null; dubbedVideoUrl?: string | null; originalB2Key?: string | null; dubbedB2Key?: string | null; reportB2Key?: string | null };
type Preflight = { fingerprint: string; geminiModel: string; cleanupNeeded: boolean; storage: { availableBytes: number; requiredBytes: number; cleanedBytes?: number }; limitations: string; durationSeconds?: number };

const initialProjects: Project[] = [];
const exampleProject: Project = { title: 'Hindi–Marathi', source: 'Hindi', target: 'Marathi', status: 'Example', issues: 0, date: 'Shared demo', color: 'lilac', initials: 'HI', isExample: true };
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
function findingDetail(issue: Issue) {
  const legacyNumbers = issue.detail.match(/Source values:\s*(.*?)\s*·\s*Back-translation values:\s*(.*)/i);
  if (legacyNumbers) {
    return 'This older alert compared number lists, not the spoken sentences. It cannot show what the source said or what the dub said, so it does not identify a mistake. Play the clips to check this passage.';
  }
  return issue.detail;
}
const formatDuration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
const estimateWorkflowTime = (videoMinutes: number) => {
  const seconds = videoMinutes * 60;
  const minimum = Math.max(60, Math.round(seconds * 0.45 + 45));
  const maximum = Math.max(180, Math.round(seconds * 1.7 + 120));
  return `${formatDuration(minimum)}–${formatDuration(maximum)}`;
};
const formatEstimate = (value: number, currency: 'INR' | 'USD') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: currency === 'INR' ? 2 : 4, minimumFractionDigits: currency === 'INR' ? 2 : 4 }).format(value);
const remainingEstimate = (range: { min: number; max: number } | null, elapsed: number) => {
  if (!range) return 'Estimating from video duration…';
  if (elapsed >= range.max) return 'Taking longer than the initial estimate';
  const min = Math.max(0, range.min - elapsed);
  const max = Math.max(0, range.max - elapsed);
  return `${formatDuration(min)}–${formatDuration(max)} estimated left`;
};

function SarvamLogoMark() {
  return <span className="sarvam-mark-wrap"><img className="sarvam-mark" src="/sarvamlogo.svg" alt="" aria-hidden="true" /></span>;
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

export default function SatvicFluidDashboard({ initialAccountEmail = '', initialAccountAvatar = 'sage', initialAccountUserId }: { initialAccountEmail?: string; initialAccountAvatar?: string; initialAccountUserId: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [selectedMapState, setSelectedMapState] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [folderDeleteConfirmOpen, setFolderDeleteConfirmOpen] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [renameFolderError, setRenameFolderError] = useState('');
  const [renameFolderSaving, setRenameFolderSaving] = useState(false);
  const [projectFolderId, setProjectFolderId] = useState('');
  const [workflowProjectOpen, setWorkflowProjectOpen] = useState(false);
  const [workflowProjectCreating, setWorkflowProjectCreating] = useState(false);
  const [workflowProjectName, setWorkflowProjectName] = useState('');
  const [workflowProjectError, setWorkflowProjectError] = useState('');
  const [workflowProjectBusy, setWorkflowProjectBusy] = useState(false);
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState(initialAccountEmail);
  const [activeTab, setActiveTab] = useState('All projects');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoRenamedProjectIds = useRef(new Set<string>());
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [projectMenuPosition, setProjectMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState<Project | null>(null);
  const [reportPage, setReportPage] = useState(false);
  const [reportDeleteConfirmOpen, setReportDeleteConfirmOpen] = useState(false);
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
  const [retryingQaJobId, setRetryingQaJobId] = useState<string | null>(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [b2Configured, setB2Configured] = useState(false);
  const [archiveMenuOpen, setArchiveMenuOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [renameProjectOpen, setRenameProjectOpen] = useState(false);
  const [renameProjectValue, setRenameProjectValue] = useState('');
  const [renameProjectBusy, setRenameProjectBusy] = useState(false);
  const [costEstimateOpen, setCostEstimateOpen] = useState(false);
  const [costEstimateClosing, setCostEstimateClosing] = useState(false);
  const [costEstimatePage, setCostEstimatePage] = useState(false);
  const [usdInrRate, setUsdInrRate] = useState<number | null>(null);
  const [exchangeRateDate, setExchangeRateDate] = useState<string | null>(null);
  const [exchangeRateLoading, setExchangeRateLoading] = useState(false);
  const [costEstimateSelectedFolderId, setCostEstimateSelectedFolderId] = useState<string | null>(null);
  const [costDockOrigin, setCostDockOrigin] = useState({ x: 500, y: 380 });
  const costEstimateButtonRef = useRef<HTMLButtonElement>(null);
  const [costDurations, setCostDurations] = useState<Record<string, string>>({});
  const [costWorkflowModes, setCostWorkflowModes] = useState<Record<string, 'sarvam' | 'review'>>({});
  const [costRates, setCostRates] = useState({ dubbingPerMinute: 40, speechToTextPerMinute: 0.49, translatePerThousandCharacters: 2, charactersPerMinute: 1000, geminiInputUsdPerMillion: 0.75, geminiOutputUsdPerMillion: 3.75, geminiInputTokensPerMinute: 3500, geminiOutputTokensPerMinute: 500 });
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
  const continueWorkflowInProject = (folderId: string) => {
    setGenerationMode(isSarvamWorkflow ? 'sarvam' : 'existing');
    setPreflight(null);
    setProjectFolderId(folderId);
    setWorkflowProjectOpen(false);
    setWorkflowProjectCreating(false);
    setModal(true);
  };
  const openActiveWorkflow = () => {
    setProjectName(`${source} to ${target}`);
    setWorkflowProjectError('');
    setWorkflowProjectName('');
    setWorkflowProjectCreating(false);
    setWorkflowProjectOpen(true);
  };

  async function createWorkflowProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workflowProjectName.trim();
    if (!name || workflowProjectBusy) return;
    setWorkflowProjectBusy(true);
    setWorkflowProjectError('');
    try {
      const response = await fetch('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create this project.');
      const folder = body.folder as ProjectFolder;
      setFolders(current => [...current, folder]);
      setActiveFolderId(folder.id);
      setWorkflowProjectName('');
      continueWorkflowInProject(folder.id);
    } catch (error) {
      setWorkflowProjectError(error instanceof Error ? error.message : 'Could not create this project.');
    } finally {
      setWorkflowProjectBusy(false);
    }
  }

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
        const jobs = (body.jobs || []) as Array<{ id: string; run_id: string | null; project_name: string; source_language: string; target_language: string; folder_id?: string | null; dubbed_available?: boolean; created_at: string; updated_at?: string; status: string; issue_count?: number; error_message?: string | null }>;
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
        setProjects([exampleProject, ...merged.map((job) => {
          const completionMs = job.updated_at ? Date.parse(job.updated_at) - Date.parse(job.created_at) : NaN;
          const status: Project['status'] = job.status === 'completed' ? (job.issue_count ? 'Needs review' : 'Ready') : job.status === 'failed' ? 'Failed' : 'In progress';
          return { title: job.project_name, source: job.source_language, target: job.target_language, status, issues: job.issue_count || 0, date: new Date(job.created_at).toLocaleDateString(), createdAt: job.created_at, color: 'lilac', initials: job.project_name.slice(0, 2).toUpperCase(), jobId: job.run_id || job.id, folderId: job.folder_id || undefined, workflowMode: job.run_id ? 'sarvam' as const : 'review' as const, dubbedAvailable: Boolean(job.dubbed_available), completedSeconds: (job.status === 'completed' || job.status === 'failed') && Number.isFinite(completionMs) && completionMs >= 0 ? Math.round(completionMs / 1000) : undefined, errorMessage: job.error_message || undefined };
        })]);
      } catch { /* Keep the current dashboard visible if history is temporarily unavailable. */ }
    };
    void refreshJobs();
    const timer = window.setInterval(refreshJobs, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/folders', { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error(body.error || 'Could not load folders.');
        setFolders(Array.isArray(body.folders) ? body.folders : []);
      })
      .catch(error => { if (active) setNotice(error instanceof Error ? error.message : 'Could not load folders.'); })
      .finally(() => { if (active) setFoldersLoading(false); });
    return () => { active = false; };
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
    if (!details?.jobId || details.isExample) {
      setReport(null);
      return;
    }
    let active = true;
    setReport(null);
    fetch(`/api/jobs/${encodeURIComponent(details.jobId)}`, { cache: 'no-store' })
      .then(async response => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.ok && body.report) setReport(body.report as AnalysisReport);
        else if (body.status === 'running') setNotice('This job is still running on the server. Check back here after it completes.');
        else if (body.status === 'failed' || !response.ok) {
          if (body.status === 'failed' && (body.originalVideoUrl || body.dubbedVideoUrl)) setDetails(current => current && current.jobId === details.jobId ? { ...current, originalVideoUrl: body.originalVideoUrl || current.originalVideoUrl, dubbedVideoUrl: body.dubbedVideoUrl || current.dubbedVideoUrl, dubbedAvailable: Boolean(body.dubbedVideoUrl || current.dubbedAvailable) } : current);
          setNotice(body.error || 'This job failed. Open the project for details.');
        }
      })
      .catch(() => { if (active) setNotice('Could not load this job report. Check your connection and try again.'); });
    return () => { active = false; };
  }, [details?.jobId]);

  const visibleProjects = useMemo(() => projects.filter((p) => {
    const matchQuery = `${p.title} ${p.target} ${p.source}`.toLowerCase().includes(query.toLowerCase());
    const matchFolder = activeFolderId ? !p.isExample && p.folderId === activeFolderId : true;
    const matchMapState = !selectedMapState || languagesForIndiaState(selectedMapState).includes(p.target);
    return matchQuery && matchFolder && matchMapState;
  }), [projects, query, activeFolderId, selectedMapState]);

  const folderProjects = activeFolderId ? projects.filter(project => project.folderId === activeFolderId && !project.isExample) : projects.filter(project => !project.isExample);
  const costEstimateProjects = projects.filter(project => !project.isExample && Boolean(project.folderId));
  const costEstimateRows = useMemo(() => costEstimateProjects.map(project => {
    const key = project.jobId || project.title;
    const minutes = Number(costDurations[key] || (project.sourceDurationSeconds ? (project.sourceDurationSeconds / 60).toFixed(2) : 0));
    const mode = costWorkflowModes[key] || project.workflowMode || 'sarvam';
    const sarvamInr = minutes > 0
      ? minutes * costRates.speechToTextPerMinute * (mode === 'sarvam' ? 1 : 2)
        + minutes * costRates.charactersPerMinute / 1000 * costRates.translatePerThousandCharacters
        + (mode === 'sarvam' ? minutes * costRates.dubbingPerMinute : 0)
      : null;
    const geminiUsd = minutes > 0
      ? (minutes * costRates.geminiInputTokensPerMinute * costRates.geminiInputUsdPerMillion
        + minutes * costRates.geminiOutputTokensPerMinute * costRates.geminiOutputUsdPerMillion) / 1_000_000
      : null;
    return { project, key, minutes, mode, sarvamInr, geminiUsd };
  }), [costEstimateProjects, costDurations, costWorkflowModes, costRates]);
  const costEstimateTotals = useMemo(() => costEstimateRows.reduce((totals, row) => ({
    minutes: totals.minutes + (row.sarvamInr === null ? 0 : row.minutes),
    sarvamInr: totals.sarvamInr + (row.sarvamInr || 0),
    geminiUsd: totals.geminiUsd + (row.geminiUsd || 0),
    estimatedCount: totals.estimatedCount + (row.sarvamInr === null ? 0 : 1),
  }), { minutes: 0, sarvamInr: 0, geminiUsd: 0, estimatedCount: 0 }), [costEstimateRows]);
  const folderCostEstimates = useMemo(() => folders.map(folder => {
    const rows = costEstimateRows.filter(row => row.project.folderId === folder.id);
    const totals = rows.reduce((sum, row) => ({
      sarvamInr: sum.sarvamInr + (row.sarvamInr || 0),
      geminiUsd: sum.geminiUsd + (row.geminiUsd || 0),
      minutes: sum.minutes + (row.sarvamInr === null ? 0 : row.minutes),
      estimatedCount: sum.estimatedCount + (row.sarvamInr === null ? 0 : 1),
    }), { sarvamInr: 0, geminiUsd: 0, minutes: 0, estimatedCount: 0 });
    return { folder, rows, totals };
  }), [folders, costEstimateRows]);
  const costEstimateDockRows = useMemo(() => costEstimateSelectedFolderId
    ? costEstimateRows.filter(row => row.project.folderId === costEstimateSelectedFolderId)
    : costEstimateRows, [costEstimateRows, costEstimateSelectedFolderId]);
  const costEstimateDockTotals = useMemo(() => costEstimateDockRows.reduce((sum, row) => ({
    sarvamInr: sum.sarvamInr + (row.sarvamInr || 0),
    geminiUsd: sum.geminiUsd + (row.geminiUsd || 0),
  }), { sarvamInr: 0, geminiUsd: 0 }), [costEstimateDockRows]);
  const searchFolders = useMemo(() => {
    if (activeFolderId) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchingFolders = folders.filter(folder => !normalizedQuery || folder.name.toLocaleLowerCase().includes(normalizedQuery));
    return matchingFolders.sort((a, b) => {
      if (!normalizedQuery) return 0;
      return Number(b.name.toLocaleLowerCase().startsWith(normalizedQuery)) - Number(a.name.toLocaleLowerCase().startsWith(normalizedQuery));
    }).slice(0, 5);
  }, [folders, query, activeFolderId]);
  const searchProjects = useMemo(() => {
    if (!activeFolderId) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchingProjects = projects.filter(project => !project.isExample && project.folderId === activeFolderId
      && (!normalizedQuery || `${project.title} ${project.target} ${project.source} ${project.status} ${folders.find(folder => folder.id === project.folderId)?.name || ''}`.toLocaleLowerCase().includes(normalizedQuery)));
    return matchingProjects.sort((a, b) => {
      if (!normalizedQuery) return 0;
      const aStarts = a.title.toLocaleLowerCase().startsWith(normalizedQuery);
      const bStarts = b.title.toLocaleLowerCase().startsWith(normalizedQuery);
      return Number(bStarts) - Number(aStarts);
    }).slice(0, 8);
  }, [projects, folders, query, activeFolderId]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault();
        setQuery('');
        setSearchOpen(false);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  function openSearchProject(project: Project) {
    setSearchOpen(false);
    setQuery('');
    setReportPage(false);
    if (project.isExample) {
      setNotice('This is a shared sample project. No video or QA report is attached.');
      return;
    }
    setProjectMenuId(null);
    setReport(null);
    setDetails(project);
  }

  function openSearchFolder(folder: ProjectFolder) {
    setSearchOpen(false);
    setQuery('');
    setActiveFolderId(folder.id);
    setActiveTab('All projects');
  }

  function openFirstSearchResult() {
    if (searchFolders[0]) openSearchFolder(searchFolders[0]);
    else if (searchProjects[0]) openSearchProject(searchProjects[0]);
  }

  const stateFolderProjects = selectedMapState
    ? folderProjects.filter(project => languagesForIndiaState(selectedMapState).includes(project.target))
    : folderProjects;
  const latestFindingProject = stateFolderProjects.find(project => project.issues > 0 && project.jobId)
    ?? stateFolderProjects.find(project => project.status === 'Ready' && project.jobId)
    ?? stateFolderProjects.find(project => project.jobId)
    ?? null;
  const displayedLatestReport = latestReport && (!selectedMapState || languagesForIndiaState(selectedMapState).includes(latestReport.targetLanguage)) ? latestReport : null;

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

  useEffect(() => {
    if (!activeFolderId) return;
    const oldProjects = projects.filter(project => project.folderId === activeFolderId
      && project.jobId
      && project.status !== 'In progress'
      && project.title !== `${project.source} to ${project.target}`
      && !autoRenamedProjectIds.current.has(project.jobId));
    for (const project of oldProjects) {
      const jobId = project.jobId!;
      const projectName = `${project.source} to ${project.target}`;
      autoRenamedProjectIds.current.add(jobId);
      void fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectName }),
      }).then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not update the video name.');
        setProjects(current => current.map(item => item.jobId === jobId ? { ...item, title: projectName, initials: projectName.slice(0, 2).toUpperCase() } : item));
        setDetails(current => current?.jobId === jobId ? { ...current, title: projectName, initials: projectName.slice(0, 2).toUpperCase() } : current);
        setReport(current => current?.project === project.title ? { ...current, project: projectName } : current);
        setLatestReport(current => current?.project === project.title ? { ...current, project: projectName } : current);
      }).catch(() => {
        autoRenamedProjectIds.current.delete(jobId);
      });
    }
  }, [activeFolderId, projects]);

  const audioReviewSummary = !report?.audioReviewCompleted
    ? 'Audio review unavailable.'
    : report.reviewComplete === false
      ? 'Audio review incomplete; check the flagged timestamps below.'
      : (report.audioReviewFindingCount ?? 0) > 0
        ? `${report.audioReviewFindingCount} audio finding${report.audioReviewFindingCount === 1 ? '' : 's'}; check the timestamps below.`
        : report.findings.some(finding => finding.evidenceStatus === 'transcript-only')
          ? 'No direct audio findings; transcript flags are unconfirmed.'
          : 'No direct audio findings.';

  async function retrySavedDubQa(project: Project) {
    if (!project.jobId || retryingQaJobId) return;
    setRetryingQaJobId(project.jobId);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(project.jobId)}/retry`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not retry QA.');
      const nextRunId = String(body.runId || project.jobId);
      const updated = { ...project, jobId: nextRunId, status: 'In progress' as const, errorMessage: undefined, dubbedAvailable: true };
      setProjects(current => current.map(item => item.jobId === project.jobId ? updated : item));
      setDetails(current => current && current.jobId === project.jobId ? updated : current);
      setNotice('Retrying QA with your saved dub. Sarvam will not dub the video again.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not retry QA.');
    } finally {
      setRetryingQaJobId(null);
    }
  }

  async function downloadProjectDub(project: Project) {
    if (!project.jobId || downloadingProjectId) return;
    setDownloadingProjectId(project.jobId);
    try {
      let mediaUrl = project.dubbedVideoUrl || '';
      if (!mediaUrl) {
        const response = await fetch(`/api/jobs/${encodeURIComponent(project.jobId)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load the dubbed video.');
        mediaUrl = body.dubbedVideoUrl || body.report?.dubbedVideoUrl || '';
      }
      if (!mediaUrl) throw new Error('The dubbed video is not available yet.');
      const anchor = document.createElement('a');
      anchor.href = mediaUrl;
      anchor.download = `${project.title.replace(/[^\w-]+/g, '-')}-${project.target.toLowerCase()}-dub.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not download the dubbed video.');
    } finally {
      setDownloadingProjectId(null);
    }
  }

  function openCostEstimator(folderId: string | null, triggerElement?: HTMLElement | null) {
    const trigger = (triggerElement || costEstimateButtonRef.current)?.getBoundingClientRect();
    const panelWidth = Math.min(790, window.innerWidth - 40);
    const panelHeight = Math.min(620, window.innerHeight - 40);
    const panelLeft = (window.innerWidth - panelWidth) / 2;
    const panelTop = (window.innerHeight - panelHeight) / 2;
    if (trigger) setCostDockOrigin({ x: trigger.left + trigger.width / 2 - panelLeft, y: trigger.top + trigger.height / 2 - panelTop });
    const storageKey = 'satvic-cost-estimate:all-projects';
    let savedDurations: Record<string, string> = {};
    try { savedDurations = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, string>; } catch { savedDurations = {}; }
    setCostDurations(current => {
      const next = { ...current };
      for (const project of costEstimateProjects) {
        const key = project.jobId || project.title;
        next[key] = savedDurations[key] ?? current[key] ?? (project.sourceDurationSeconds ? (project.sourceDurationSeconds / 60).toFixed(2) : '');
      }
      return next;
    });
    setCostWorkflowModes(current => {
      const next = { ...current };
      for (const project of costEstimateProjects) {
        const key = project.jobId || project.title;
        next[key] ||= project.workflowMode || 'sarvam';
      }
      return next;
    });
    setCostEstimateSelectedFolderId(folderId);
    setCostEstimateClosing(false);
    setCostEstimateOpen(true);
  }

  function closeCostEstimator() {
    if (costEstimateClosing) return;
    setCostEstimateClosing(true);
    window.setTimeout(() => {
      setCostEstimateOpen(false);
      setCostEstimateClosing(false);
      costEstimateButtonRef.current?.focus();
    }, 320);
  }

  function updateCostDuration(projectKey: string, value: string, folderId: string | null = null) {
    setCostDurations(current => {
      const next = { ...current, [projectKey]: value };
      try { localStorage.setItem('satvic-cost-estimate:all-projects', JSON.stringify(next)); } catch { /* Estimates remain usable for this session. */ }
      return next;
    });
  }

  function toggleProjectMenu(event: React.MouseEvent<HTMLButtonElement>, projectId: string) {
    if (!projectId) return;
    if (projectMenuId === projectId) {
      setProjectMenuId(null);
      setProjectMenuPosition(null);
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    const menuHeight = 148;
    const menuTop = button.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, button.top - menuHeight - 4)
      : button.bottom + 4;
    setProjectMenuPosition({ top: menuTop, left: Math.max(8, Math.min(button.right - 220, window.innerWidth - 228)) });
    setDeleteConfirmId(null);
    setProjectMenuId(projectId);
  }

  useEffect(() => {
    if (!costEstimateOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeCostEstimator(); };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [costEstimateOpen]);

  useEffect(() => {
    if (!costEstimatePage && !costEstimateOpen) return;
    let active = true;
    setExchangeRateLoading(true);
    fetch('/api/cost-estimate/exchange-rate', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Exchange rate unavailable.');
        return payload as { rate: number; time: string };
      })
      .then(payload => {
        if (!active || !Number.isFinite(payload.rate)) return;
        setUsdInrRate(payload.rate);
        setExchangeRateDate(payload.time);
      })
      .catch(() => {
        if (!active) return;
        setUsdInrRate(null);
        setExchangeRateDate(null);
      })
      .finally(() => { if (active) setExchangeRateLoading(false); });
    return () => { active = false; };
  }, [costEstimatePage, costEstimateOpen]);

  useEffect(() => {
    if (!projectMenuId) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.project-actions-menu, .row-more')) return;
      setProjectMenuId(null);
      setProjectMenuPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setProjectMenuId(null);
      setProjectMenuPosition(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectMenuId]);

  useEffect(() => {
    const saved: Record<string, string> = {};
    for (const projectId of ['all-projects', ...folders.map(folder => folder.id)]) {
      try {
        Object.assign(saved, JSON.parse(localStorage.getItem(`satvic-cost-estimate:${projectId}`) || '{}'));
      } catch { /* Ignore invalid browser-saved estimates. */ }
    }
    setCostDurations(current => ({ ...saved, ...current }));
  }, [folders]);

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
        setPreflight({ fingerprint, geminiModel: body.geminiModel, cleanupNeeded: body.cleanupNeeded, storage: body.storage, limitations: body.limitations, durationSeconds: longest });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Preflight failed. No video was uploaded and no dubbing job was started.');
      } finally { setBusy(false); setCheckingReadiness(false); }
      return;
    }
    const measuredDurationSeconds = preflight?.durationSeconds || 0;
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
        const stored = await uploadPresigned(`satvic-users/${initialAccountUserId}/satvic-jobs/${crypto.randomUUID()}-${originalFile.name.replace(/[^\w.-]+/g, '-')}`, originalFile, {
          access: 'private', handleUploadUrl: '/api/blob/upload', multipart: true,
          onUploadProgress: ({ percentage }) => setAnalysisProgress({ stage: `Uploading video to secure storage · ${Math.round(percentage)}%`, percent: Math.max(4, Math.round(percentage * 0.35)), status: 'processing', startedAt }),
        });
        setAnalysisProgress({ stage: 'Handing job to the server workflow', percent: 38, status: 'processing', startedAt });
        const startResponse = await fetch('/api/jobs/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originalBlobUrl: stored.url, originalName: originalFile.name, sourceLanguage: source, targetLanguage: target, projectName: cleanProjectName, folderId: projectFolderId || null }) });
        const startBody = await readApiJson(startResponse);
        if (!startResponse.ok) throw new Error(startBody.error || 'Could not start the server-side dubbing job.');
        const title = cleanProjectName;
        const project: Project = { title, source, target, status: 'In progress', issues: 0, date: 'Just now', createdAt: new Date().toISOString(), color: 'lilac', initials: title.slice(0, 2).toUpperCase(), jobId: startBody.runId, folderId: projectFolderId || undefined, workflowMode: 'sarvam', sourceDurationSeconds: measuredDurationSeconds || undefined };
        if (measuredDurationSeconds) updateCostDuration(project.jobId || title, (measuredDurationSeconds / 60).toFixed(2), projectFolderId || null);
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
        uploadPresigned(`satvic-users/${initialAccountUserId}/satvic-jobs/${crypto.randomUUID()}-${originalFile.name.replace(/[^\w.-]+/g, '-')}`, originalFile, { access: 'private', handleUploadUrl: '/api/blob/upload', multipart: true, onUploadProgress: ({ percentage }) => setAnalysisProgress({ stage: `Uploading original track · ${Math.round(percentage)}%`, percent: Math.max(8, Math.round(percentage * 0.22)), status: 'processing', startedAt }) }),
        uploadPresigned(`satvic-users/${initialAccountUserId}/satvic-jobs/${crypto.randomUUID()}-${finalDub.name.replace(/[^\w.-]+/g, '-')}`, finalDub, { access: 'private', handleUploadUrl: '/api/blob/upload', multipart: true, onUploadProgress: ({ percentage }) => setAnalysisProgress({ stage: `Uploading dub track · ${Math.round(percentage)}%`, percent: Math.max(8, Math.round(percentage * 0.22)), status: 'processing', startedAt }) }),
      ]);
      const title = cleanProjectName;
      const jobResponse = await fetch('/api/jobs/manual', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ originalBlobUrl: originalStored.url, dubbedBlobUrl: dubbedStored.url, originalName: originalFile.name, sourceLanguage: source, targetLanguage: target, projectName: title, folderId: projectFolderId || null }) });
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
      const project: Project = { title: result.project || title, source, target, status: 'Needs review', issues: result.findings.length, date: 'Just now', createdAt: new Date().toISOString(), color: 'lilac', initials: title.slice(0, 2).toUpperCase(), jobId: jobBody.jobId, folderId: projectFolderId || undefined, workflowMode: 'review', sourceDurationSeconds: measuredDurationSeconds || undefined };
      if (measuredDurationSeconds) updateCostDuration(project.jobId || title, (measuredDurationSeconds / 60).toFixed(2), projectFolderId || null);
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

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || folderSaving) return;
    setFolderSaving(true);
    setFolderError('');
    try {
      const response = await fetch('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not create this folder.');
      const folder = body.folder as ProjectFolder;
      setFolders(current => [...current, folder]);
      setActiveFolderId(folder.id);
      setProjectFolderId(folder.id);
      setFolderName('');
      setFolderDialogOpen(false);
      setNotice(`Folder “${folder.name}” created.`);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : 'Could not create this folder.');
    } finally {
      setFolderSaving(false);
    }
  }

  async function renameActiveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folderId = activeFolderId;
    const name = renameFolderName.trim();
    if (!folderId || !name || renameFolderSaving) return;
    setRenameFolderSaving(true);
    setRenameFolderError('');
    try {
      const response = await fetch('/api/folders', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folderId, name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not rename this folder.');
      const updatedFolder = body.folder as ProjectFolder;
      setFolders(current => current.map(folder => folder.id === folderId ? updatedFolder : folder));
      setRenameFolderOpen(false);
      setNotice(`Folder renamed to “${updatedFolder.name}”.`);
    } catch (error) {
      setRenameFolderError(error instanceof Error ? error.message : 'Could not rename this folder.');
    } finally {
      setRenameFolderSaving(false);
    }
  }

  async function saveFolderFeedbackLinks(formUrl: string, sheetUrl: string) {
    const folderId = activeFolderId;
    if (!folderId) throw new Error('Open a project folder before adding its feedback form.');
    const response = await fetch('/api/folders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId, feedbackFormUrl: formUrl, feedbackSheetUrl: sheetUrl }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not save the Google Form link.');
    const updatedFolder = body.folder as ProjectFolder;
    setFolders(current => current.map(folder => folder.id === folderId ? updatedFolder : folder));
    setNotice(formUrl && sheetUrl ? 'Feedback form and response Sheet saved for this project.' : 'Feedback links removed.');
  }

  async function deleteActiveFolder() {
    const folderId = activeFolderId;
    if (!folderId || deletingFolderId) return;
    setDeletingFolderId(folderId);
    try {
      const response = await fetch('/api/folders', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not delete this folder.');
      setFolders(current => current.filter(folder => folder.id !== folderId));
      setProjects(current => current.map(project => project.folderId === folderId ? { ...project, folderId: undefined } : project));
      setActiveFolderId(null);
      setActiveTab('All projects');
      setFolderDeleteConfirmOpen(false);
      setNotice('Folder deleted. Its videos are back in Projects.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete this folder.');
    } finally {
      setDeletingFolderId(null);
    }
  }

  async function moveProjectToFolder(project: Project, folderId: string) {
    if (!project.jobId || movingProjectId === project.jobId) return;
    const nextFolderId = folderId || null;
    if ((project.folderId || null) === nextFolderId) return;
    setMovingProjectId(project.jobId);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(project.jobId)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folderId: nextFolderId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not move this project.');
      setProjects(current => current.map(item => item.jobId === project.jobId ? { ...item, folderId: nextFolderId || undefined } : item));
      setDetails(current => current && current.jobId === project.jobId ? { ...current, folderId: nextFolderId || undefined } : current);
      setProjectMenuId(null);
      setNotice(nextFolderId ? `Moved to ${folders.find(folder => folder.id === nextFolderId)?.name || 'folder'}.` : 'Removed from folder.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not move this project.');
    } finally {
      setMovingProjectId(null);
    }
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
      setReportPage(false);
      setReportDeleteConfirmOpen(false);
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
      accountAvatar={initialAccountAvatar}
      onNotice={setNotice}
      initialFeatureId="generate-sarvam"
      onFeatureSelect={(featureId) => {
        if (featureId === 'cost-estimate') {
          setActiveFolderId(null);
          setCostEstimatePage(true);
          setCostEstimateOpen(false);
        } else {
          setCostEstimatePage(false);
          setActiveWorkflow(featureId as 'generate-sarvam' | 'start-review');
        }
      }}
    >
      {workflowProjectOpen && <div className="modal-backdrop workflow-project-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!workflowProjectBusy)setWorkflowProjectOpen(false)}}><section className="workflow-project-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-project-title">
        <button type="button" className="modal-close icon-btn" onClick={()=>{if(!workflowProjectBusy)setWorkflowProjectOpen(false)}} aria-label="Close"><X size={18}/></button><span className="folder-create-icon"><FolderOpen size={19}/></span><div className="section-kicker">START A WORKFLOW</div><h2 id="workflow-project-title">Choose a project</h2><p className="modal-intro">Select where to save this dub and its QA report, or create a project.</p>
        {workflowProjectCreating ? <form onSubmit={createWorkflowProject}><label className="field-label">Project name<input className="text-input" autoFocus value={workflowProjectName} onChange={event=>setWorkflowProjectName(event.target.value)} maxLength={80} placeholder="e.g. How much protein in milk?" required /></label>{workflowProjectError&&<div className="auth-error folder-create-error" role="alert">{workflowProjectError}</div>}<div className="folder-create-actions"><button type="button" className="secondary-btn" onClick={()=>{setWorkflowProjectCreating(false);setWorkflowProjectError('')}} disabled={workflowProjectBusy}>Back</button><button type="submit" className="primary-btn" disabled={workflowProjectBusy}>{workflowProjectBusy?<><span className="spinner"/> Creating…</>:<><FolderPlus size={15}/> Create project</>}</button></div></form> : <><div className="workflow-project-options"><button type="button" className="workflow-project-option" onClick={()=>continueWorkflowInProject('')}><FolderOpen size={17}/><span><b>All videos</b><small>Save without assigning a project.</small></span><small>{projects.filter(project=>!project.isExample&&!project.folderId).length}</small><ArrowRight size={15}/></button>{folders.map(folder=><button type="button" className="workflow-project-option" key={folder.id} onClick={()=>continueWorkflowInProject(folder.id)}><Folder size={17}/><span><b>{folder.name}</b><small>Project folder</small></span><small>{projects.filter(project=>!project.isExample&&project.folderId===folder.id).length}</small><ArrowRight size={15}/></button>)}{foldersLoading&&<div className="workflow-project-loading"><span className="spinner"/> Loading projects…</div>}{!foldersLoading&&!folders.length&&<div className="workflow-project-empty">No projects yet. Create one to keep this work organized.</div>}</div><button type="button" className="workflow-project-create" onClick={()=>{setWorkflowProjectCreating(true);setWorkflowProjectError('')}}><FolderPlus size={15}/> Create project</button></>}
      </section></div>}
      {folderDialogOpen && <div className="modal-backdrop folder-create-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!folderSaving)setFolderDialogOpen(false)}}><form className="folder-create-modal" onSubmit={createFolder}>
        <button type="button" className="modal-close icon-btn" onClick={()=>{if(!folderSaving)setFolderDialogOpen(false)}} aria-label="Close"><X size={18}/></button><span className="folder-create-icon"><FolderPlus size={19}/></span><div className="section-kicker">ORGANIZE YOUR VIDEOS</div><h2>New folder</h2><p className="modal-intro">Group dubbed videos and their QA findings in one place.</p>
        <label className="field-label">Folder name<input className="text-input" autoFocus value={folderName} onChange={event=>setFolderName(event.target.value)} maxLength={80} placeholder="e.g. How much protein in milk?" required /></label>
        {folderError&&<div className="auth-error folder-create-error" role="alert">{folderError}</div>}
        <div className="folder-create-actions"><button type="button" className="secondary-btn" onClick={()=>setFolderDialogOpen(false)} disabled={folderSaving}>Cancel</button><button type="submit" className="primary-btn" disabled={folderSaving}>{folderSaving?<><span className="spinner"/> Creating folder…</>:<><FolderPlus size={15}/> Create folder</>}</button></div>
      </form></div>}
      {renameFolderOpen && activeFolderId && <div className="modal-backdrop folder-create-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!renameFolderSaving)setRenameFolderOpen(false)}}><form className="folder-create-modal" role="dialog" aria-modal="true" aria-labelledby="rename-folder-title" onSubmit={renameActiveFolder}>
        <button type="button" className="modal-close icon-btn" onClick={()=>{if(!renameFolderSaving)setRenameFolderOpen(false)}} aria-label="Close rename folder dialog"><X size={18}/></button><span className="folder-create-icon"><Pencil size={18}/></span><div className="section-kicker">PROJECT FOLDER</div><h2 id="rename-folder-title">Rename folder</h2><p className="modal-intro">Update the name for this folder. Its videos and feedback links will stay in place.</p>
        <label className="field-label">Folder name<input className="text-input" autoFocus value={renameFolderName} onChange={event=>setRenameFolderName(event.target.value)} maxLength={80} required /></label>
        {renameFolderError&&<div className="auth-error folder-create-error" role="alert">{renameFolderError}</div>}
        <div className="folder-create-actions"><button type="button" className="secondary-btn" onClick={()=>setRenameFolderOpen(false)} disabled={renameFolderSaving}>Cancel</button><button type="submit" className="primary-btn" disabled={renameFolderSaving || !renameFolderName.trim()}>{renameFolderSaving?<><span className="spinner"/> Saving…</>:<><Check size={15}/> Save name</>}</button></div>
      </form></div>}
      {folderDeleteConfirmOpen && activeFolderId && <div className="modal-backdrop folder-delete-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!deletingFolderId)setFolderDeleteConfirmOpen(false)}}><section className="folder-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="folder-delete-title">
        <span className="folder-delete-icon"><Trash2 size={19}/></span><div className="section-kicker">DELETE PROJECT FOLDER</div><h2 id="folder-delete-title">Delete this folder?</h2><p>Its {folderProjects.length} videos will move back to Projects and stay in your account.</p><div className="folder-delete-actions"><button type="button" className="secondary-btn" onClick={()=>setFolderDeleteConfirmOpen(false)} disabled={Boolean(deletingFolderId)}>Cancel</button><button type="button" className="folder-delete-confirm" onClick={()=>void deleteActiveFolder()} disabled={Boolean(deletingFolderId)}>{deletingFolderId?<><span className="spinner"/> Deleting…</>:<><Trash2 size={14}/> Delete folder</>}</button></div>
      </section></div>}
      {searchOpen && <div className="spotlight-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setQuery(''); setSearchOpen(false); } }}>
        <section className="spotlight-panel" role="dialog" aria-modal="true" aria-label="Search workspace projects">
          <div className="spotlight-input-row"><Search size={21} aria-hidden="true"/><input ref={searchInputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder={activeFolderId ? "Search videos, languages, or status..." : "Search project folders..."} aria-label={activeFolderId ? "Search videos, languages, or status" : "Search project folders"} onKeyDown={event => { if (event.key === 'Enter' && (searchFolders.length || searchProjects.length)) { event.preventDefault(); openFirstSearchResult(); } }} /><button type="button" className="spotlight-escape" onClick={() => { setQuery(''); setSearchOpen(false); }}>ESC</button></div>
          <div className="spotlight-results" role="listbox" aria-label="Matching workspace items">
            {searchFolders.length > 0 && <><div className="spotlight-section-label">{query.trim() ? 'PROJECT FOLDERS' : 'RECENT FOLDERS'}</div>{searchFolders.map(folder => <button type="button" key={folder.id} className="spotlight-result spotlight-folder-result" role="option" aria-selected="false" onClick={() => openSearchFolder(folder)}>
              <span className="spotlight-folder-icon"><Folder size={16}/></span><span className="spotlight-result-copy"><b>{folder.name}</b><small>{projects.filter(project => project.folderId === folder.id && !project.isExample).length} videos in this project</small></span><span className="spotlight-status">Folder</span><ArrowRight className="spotlight-result-arrow" size={16}/>
            </button>)}</>}
            {searchProjects.length > 0 && <><div className="spotlight-section-label">{query.trim() ? 'MATCHING VIDEOS' : 'RECENT VIDEOS'}</div>{searchProjects.map(project => <button type="button" key={project.isExample ? 'shared-example' : project.jobId || project.title} className="spotlight-result" role="option" aria-selected="false" onClick={() => openSearchProject(project)}>
              <span className={`spotlight-project-icon ${project.color}`}>{project.initials}</span><span className="spotlight-result-copy"><b>{project.title}</b><small>{project.source} <ArrowRight size={11}/> {project.target} <i>·</i> {project.date}</small></span><span className={`spotlight-status ${project.status.toLowerCase().replace(' ', '-')}`}>{project.status}</span><ArrowRight className="spotlight-result-arrow" size={16}/>
            </button>)}</>}
            {!searchFolders.length && !searchProjects.length && <div className="spotlight-empty"><Search size={19}/><b>No matching projects or folders</b><span>Try a folder name, video title, language, or status.</span></div>}
          </div>
          <footer className="spotlight-footer"><span><kbd>↵</kbd> {activeFolderId ? 'Open video' : 'Open folder'}</span><span><kbd>ESC</kbd> Close</span><span><kbd>⌘ K</kbd> Search</span></footer>
        </section>
      </div>}
          {costEstimatePage && <section className="cost-dashboard-page" aria-label="Cost estimate dashboard">
            <header className="welcome-row"><div><h1>Cost estimate</h1><p className="welcome-subtitle">Estimate provider costs across every project in your workspace.</p></div></header>
            <section className="cost-steps-panel panel" aria-labelledby="cost-steps-title"><div className="panel-heading"><div><div className="section-kicker">COST ESTIMATE</div><h2 id="cost-steps-title">How the estimate works</h2></div></div><ol className="cost-steps-list"><li><b>1. Set video length</b><span>Uses measured source duration when available. Enter or adjust minutes for each video.</span></li><li><b>2. Select workflow</b><span>Sarvam dubbing includes dubbing, transcription, translation, and Gemini review. Existing dub review skips dubbing.</span></li><li><b>3. Estimate Sarvam</b><span>Applies the editable dubbing, Saaras transcription, and translation rates.</span></li><li><b>4. Estimate Gemini</b><span>Uses editable input and output token assumptions for transcript and audio review.</span></li></ol></section>
            <section className="cost-workspace-grid" aria-label="Project folder cost estimates"><div className="cost-projects-panel panel"><div className="panel-heading"><div><div className="section-kicker">YOUR WORKSPACE</div><h2>Project folders <span className="heading-count">{folderCostEstimates.length}</span></h2></div><span className="cost-workspace-caption">Select a folder to see its videos and estimate.</span></div><div className="cost-project-table-wrap"><table className="cost-project-table"><thead><tr><th>Project folder</th><th>Videos</th><th>Estimated spend</th><th aria-label="Open folder estimate"/></tr></thead><tbody>{foldersLoading ? <tr><td colSpan={4} className="cost-empty">Loading project folders…</td></tr> : folderCostEstimates.length ? folderCostEstimates.map(item=><tr key={item.folder.id} tabIndex={0} onClick={event=>openCostEstimator(item.folder.id,event.currentTarget)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openCostEstimator(item.folder.id,event.currentTarget)}}}><td><b>{item.folder.name}</b><small>Project folder</small></td><td>{item.rows.length} {item.rows.length===1?'video':'videos'}</td><td><b>{usdInrRate === null ? (exchangeRateLoading ? 'Loading…' : '—') : formatEstimate(item.totals.sarvamInr + item.totals.geminiUsd * usdInrRate,'INR')}</b></td><td><ArrowRight size={16}/></td></tr>) : <tr><td colSpan={4} className="cost-empty">Create a project folder to estimate its videos.</td></tr>}</tbody></table></div></div>
              <aside className="cost-spend-panel panel"><div className="section-kicker">WORKSPACE TOTAL</div><h2>Total estimated spend</h2><p>Combined estimates for videos saved inside your project folders.</p><div className="cost-spend-total"><span>Sarvam</span><b>{formatEstimate(costEstimateTotals.sarvamInr,'INR')}</b></div><div className="cost-spend-total"><span>Gemini</span><b>{formatEstimate(costEstimateTotals.geminiUsd,'USD')}<small className="cost-converted-value">≈ {usdInrRate === null ? (exchangeRateLoading ? 'Loading rate…' : 'Rate unavailable') : formatEstimate(costEstimateTotals.geminiUsd * usdInrRate,'INR')}</small></b></div><div className="cost-spend-meta"><span>{costEstimateTotals.minutes.toFixed(1)} video minutes</span><b>{costEstimateTotals.estimatedCount} / {costEstimateRows.length} estimated</b></div><div className="cost-total-costing"><span>Total costing</span><b>{usdInrRate === null ? '—' : formatEstimate(costEstimateTotals.sarvamInr + costEstimateTotals.geminiUsd * usdInrRate,'INR')}</b></div><div className="cost-exchange-rate">{usdInrRate === null ? (exchangeRateLoading ? 'Fetching current USD → INR rate…' : 'Exchange rate unavailable right now.') : `Reference rate: 1 USD = ₹${usdInrRate.toFixed(4)}${exchangeRateDate ? ` · ${new Date(exchangeRateDate).toLocaleDateString()}` : ''}`}</div></aside>
            </section>
          </section>}
          {!costEstimatePage && <section className="welcome-row"><div><h1>{activeFolderId ? folders.find(folder=>folder.id===activeFolderId)?.name : isSarvamWorkflow ? 'Generate with Sarvam' : 'Start a review'}</h1><p className="welcome-subtitle">{activeFolderId ? 'Dub videos and QA findings saved in this project.' : isSarvamWorkflow ? 'Create a dub in your target language, then review it.' : 'Compare an existing dub with its original.'}</p></div><div className="welcome-actions">{activeFolderId && <><button type="button" className="folder-back-button" onClick={()=>{setActiveFolderId(null);setActiveTab('All projects')}}><ArrowLeft size={15}/> Back to projects</button><button type="button" className="folder-rename-trigger" onClick={()=>{setRenameFolderName(folders.find(folder=>folder.id===activeFolderId)?.name || '');setRenameFolderError('');setRenameFolderOpen(true)}}><Pencil size={14}/> Rename folder</button><button type="button" className="folder-delete-trigger" onClick={()=>setFolderDeleteConfirmOpen(true)}><Trash2 size={14}/> Delete folder</button><button ref={costEstimateButtonRef} type="button" className="folder-cost-estimate-trigger" onClick={event=>openCostEstimator(activeFolderId,event.currentTarget)}><Calculator size={15}/> Cost estimate</button></>}<button className="primary-btn" onClick={openActiveWorkflow}>{isSarvamWorkflow ? <SarvamLogoMark/> : <FileAudio size={17}/>} {workflow.action}</button></div></section>}


      {!costEstimatePage && activeFolderId && <section className="folder-overview-grid" aria-label="Project overview"><IndiaCommunityMapCard projects={folderProjects} compact selectedState={selectedMapState} onStateSelect={setSelectedMapState}/><FeedbackCalendarCard folderId={activeFolderId} formUrl={folders.find(folder => folder.id === activeFolderId)?.feedback_form_url} sheetUrl={folders.find(folder => folder.id === activeFolderId)?.feedback_sheet_url} onSaveFormLinks={saveFolderFeedbackLinks}/></section>}

      {!costEstimatePage && !activeFolderId && <section className="qa-flow" aria-labelledby="qa-flow-title"><div className="qa-flow-heading"><div className="qa-flow-title"><span className={`qa-flow-brand${isSarvamWorkflow ? ' sarvam' : ' review'}`}>{isSarvamWorkflow ? <SarvamLogoMark/> : <FileAudio size={19}/>}</span><div><div className="section-kicker">{workflow.eyebrow}</div><h2 id="qa-flow-title">{workflow.title}</h2></div></div><span className="qa-flow-time"><Clock3 size={15}/> 4 steps</span></div><ol className="qa-flow-steps">{workflow.steps.map(([title,description],index)=>{const StepIcon=workflowStepIcons[index];return <li key={title}><span className="qa-step-number">0{index+1}</span><span className="qa-step-icon" aria-hidden="true"><StepIcon size={15}/></span><div><b>{title}</b><p>{description}</p></div></li>})}</ol><button className="qa-flow-action" onClick={openActiveWorkflow}>{isSarvamWorkflow ? <SarvamLogoMark/> : <FileAudio size={16}/>} Open upload <ArrowRight size={15}/></button></section>}

          {!costEstimatePage && !activeFolderId && <section className="folder-library panel" aria-label="Projects">
            <div className="panel-heading"><div><div className="section-kicker">YOUR WORKSPACE</div><h3>Projects <span className="heading-count">{folders.length}</span></h3></div><div className="project-tools"><button type="button" className="search-box search-trigger" onClick={()=>{setQuery("");setSearchOpen(true)}} aria-haspopup="dialog" aria-expanded={searchOpen}><Search size={15}/><span>Search projects</span><kbd>⌘ K</kbd></button><button type="button" className="text-action" onClick={()=>{setFolderError("");setFolderName("");setFolderDialogOpen(true)}}><FolderPlus size={14}/> New folder</button></div></div>
            {foldersLoading ? <div className="folder-library-empty">Loading projects…</div> : folders.length ? <div className="folder-library-grid">{folders.map(folder=><button type="button" className="folder-library-card" key={folder.id} onClick={()=>{setActiveFolderId(folder.id);setActiveTab("All projects")}}><Folder size={20}/><span><b>{folder.name}</b><small>{projects.filter(project=>project.folderId===folder.id&&!project.isExample).length} videos</small></span><ArrowRight size={16}/></button>)}</div> : <div className="folder-library-empty"><FolderOpen size={20}/><b>No projects yet</b><span>Create a folder to keep its dubbed videos and QA findings together.</span></div>}
          </section>}

          {!costEstimatePage && activeFolderId && <section className="work-grid folder-work-grid"><div className="projects-panel panel"><div className="panel-heading"><div><div className="section-kicker">YOUR WORKSPACE</div><h3>{activeFolderId ? folders.find(folder=>folder.id===activeFolderId)?.name : "Recent projects"} <span className="heading-count">{visibleProjects.length}</span></h3></div><button type="button" className="search-box search-trigger folder-project-search" onClick={()=>{setQuery("");setSearchOpen(true)}} aria-haspopup="dialog" aria-expanded={searchOpen}><Search size={15}/><span>Search projects</span><kbd>⌘ K</kbd></button></div>{!activeFolderId && <section className="workspace-folders" aria-label="Project folders"><div className="workspace-folders-heading"><span>FOLDERS</span><button type="button" onClick={()=>{setFolderError("");setFolderName("");setFolderDialogOpen(true)}}><FolderPlus size={14}/> New folder</button></div><div className="workspace-folder-list"><button type="button" className={"workspace-folder"+(activeFolderId===null?" active":"")} onClick={()=>{setActiveFolderId(null);setActiveTab("All projects")}}><FolderOpen size={16}/><span>All videos</span><small>{projects.filter(project=>!project.isExample).length}</small></button>{folders.map(folder=><button type="button" key={folder.id} className={"workspace-folder"+(activeFolderId===folder.id?" active":"")} onClick={()=>{setActiveFolderId(folder.id);setActiveTab("All projects")}}><Folder size={16}/><span>{folder.name}</span><small>{projects.filter(project=>project.folderId===folder.id&&!project.isExample).length}</small></button>)}{foldersLoading&&<span className="workspace-folders-loading">Loading folders…</span>}</div></section>}<div className="project-table-wrap"><table className="project-table"><thead><tr><th scope="col">Name</th><th scope="col">Target language</th><th scope="col">Estimated time</th><th scope="col">Status</th><th scope="col">Download</th><th scope="col" aria-label="Actions"/></tr></thead><tbody>{visibleProjects.length ? visibleProjects.map((p)=><tr className={cx('project-table-row',p.isExample&&'example-project-row')} key={p.isExample?'shared-example':`${p.jobId || p.title}`} onClick={()=>{if(p.isExample){setNotice('This is a shared sample project. No video or QA report is attached.');return;}setProjectMenuId(null);setReport(null);setDetails(p)}}><td data-label="Name"><div className="project-table-name"><div className={`project-thumb ${p.color}`}><span>{p.initials}</span><div className="thumb-play"><Play size={10} fill="currentColor"/></div></div><span><button type="button" className="project-open" onClick={event=>{event.stopPropagation();if(p.isExample){setNotice('This is a shared sample project. No video or QA report is attached.');return;}setProjectMenuId(null);setReport(null);setDetails(p)}}><b>{p.title}</b>{p.isExample&&<span className="example-project-badge">Example</span>}</button><small>{p.source}{p.date ? <> · {p.date}</> : null}</small></span></div></td><td data-label="Target language"><span className="project-language-chip">{p.target}</span></td><td data-label="Estimated time" className="project-created-cell" title={p.completedSeconds ? `Actual processing time: ${formatDuration(p.completedSeconds)}` : undefined}>{p.completedSeconds ? formatDuration(p.completedSeconds) : ((costDurations[p.jobId || p.title] || (p.sourceDurationSeconds ? (p.sourceDurationSeconds / 60).toFixed(2) : "")) ? `~${estimateWorkflowTime(Number(costDurations[p.jobId || p.title] || (p.sourceDurationSeconds || 0) / 60))}` : "—")}</td><td data-label="Status"><span className={cx('status-pill',p.status.toLowerCase().replace(' ','-'))}><i/>{p.status}</span></td><td data-label="Download"><button type="button" className="project-download-button" disabled={!p.dubbedAvailable||p.status==='In progress'||p.isExample||downloadingProjectId===p.jobId} onClick={event=>{event.stopPropagation();void downloadProjectDub(p)}}>{downloadingProjectId===p.jobId?<LoaderCircle size={15} className="spin"/>:<ArrowDownToLine size={15}/>} {downloadingProjectId===p.jobId?'Preparing?':'Download'}</button></td><td data-label="Actions">{!p.isExample&&<div className="project-actions" onClick={event=>event.stopPropagation()}><button type="button" className="row-more" aria-label={`Actions for ${p.title}`} aria-expanded={projectMenuId===p.jobId} onClick={event=>toggleProjectMenu(event,p.jobId??'')}><MoreHorizontal size={18}/></button>{projectMenuId===p.jobId && projectMenuPosition && createPortal(<div className="project-actions-menu" style={{ position: "fixed", top: projectMenuPosition.top, left: projectMenuPosition.left, right: "auto", zIndex: 2000 }}>{deleteConfirmId===p.jobId ? <><p>Delete this project and its stored files?</p><button type="button" className="project-delete-confirm" disabled={deletingProjectId===p.jobId} onClick={()=>void deleteProject(p)}>{deletingProjectId===p.jobId?'Deleting...':'Confirm delete'}</button><button type="button" onClick={()=>{setDeleteConfirmId(null);setProjectMenuId(null)}}>Cancel</button></> : <><button type="button" className="project-view-option" onClick={()=>{setProjectMenuId(null);setReport(null);setDetails(p);setReportDeleteConfirmOpen(false);setReportPage(true)}}><FileText size={14}/>View report</button><label className="project-folder-select"><Folder size={14}/><select aria-label={`Move ${p.title} to folder`} title="Move to folder" value="" disabled={movingProjectId===p.jobId} onChange={event=>void moveProjectToFolder(p,event.target.value==="__all_videos__"?"":event.target.value)}><option value="" disabled>{movingProjectId===p.jobId?"Moving?":"Move to folder"}</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}{p.folderId&&<option value="__all_videos__">All videos</option>}</select></label><button type="button" className="project-delete-option" onClick={()=>setDeleteConfirmId(p.jobId??null)}><Trash2 size={14}/>Delete project</button></>}</div>,document.body)}</div>}</td></tr>) : <tr><td colSpan={6}><div className="empty-state"><Search size={19}/><b>{activeFolderId ? "No videos in this folder yet" : "No matching projects"}</b><span>{activeFolderId ? "Move a project here or start a new dub in this folder." : "Try another search."}</span></div></td></tr>}</tbody></table></div><button className="list-footer" onClick={()=>setNotice('You’re viewing the latest projects in this workspace.')}>Showing {visibleProjects.length} of {folderProjects.length} projects <ArrowDown size={13}/></button></div>

          <aside className="insight-column"><section className="review-panel panel"><div className="review-heading"><div className="section-kicker">LATEST FINDINGS</div><span className="queue-count">{displayedLatestReport?.findings.length || latestFindingProject?.issues || 0}</span></div>{displayedLatestReport?.findings.length ? <div className="review-latest">{displayedLatestReport.findings.slice(0,3).map((issue,index)=><button key={`${issue.title}-${index}`} className="issue-row" onClick={()=>latestFindingProject && setDetails(latestFindingProject)}><span className={cx('severity-mark',issue.severity)}>{issue.severity==='critical'?<Zap size={14}/>:<Activity size={14}/>}</span><span className="issue-copy"><b>{issue.title}</b><span>{issue.detail}</span><small><Languages size={11}/> {displayedLatestReport.targetLanguage} dub</small></span><ArrowRight className="issue-arrow" size={14}/></button>)}</div> : latestFindingProject ? <div className="review-empty"><b>{latestFindingProject.issues} flagged {latestFindingProject.issues === 1 ? 'finding' : 'findings'}</b><span>Open the latest report to see the flagged moments.</span></div> : <div className="review-empty"><b>No findings yet</b><span>Start either workflow to create a report here.</span></div>}<button className="queue-link" onClick={()=>latestFindingProject ? setDetails(latestFindingProject) : stateFolderProjects.length ? setDetails(stateFolderProjects[0]) : openActiveWorkflow()}>{latestFindingProject || stateFolderProjects.length ? 'Open latest report' : 'Start this workflow'} <ArrowRight size={14}/></button></section></aside></section>}



      {costEstimateOpen && <div className={`cost-estimate-backdrop${costEstimateClosing?' closing':''}`} onMouseDown={event=>{if(event.target===event.currentTarget)closeCostEstimator()}}><section className="cost-estimate-panel" role="dialog" aria-modal="true" aria-labelledby="cost-estimate-title" style={{transformOrigin:`${costDockOrigin.x}px ${costDockOrigin.y}px`}}><header className="cost-estimate-header"><div><div className="section-kicker">PROJECT COST ESTIMATE</div><h2 id="cost-estimate-title">{costEstimateSelectedFolderId ? folders.find(folder=>folder.id===costEstimateSelectedFolderId)?.name || 'Project estimate' : 'All project videos'}</h2><p>{costEstimateDockRows.length} videos{costEstimateSelectedFolderId ? ' in this project' : ' across your project folders'} · adjust the workflow or duration for each video below.</p></div><button type="button" className="icon-btn" onClick={closeCostEstimator} aria-label="Close cost estimator"><X size={18}/></button></header>
        <div className="cost-estimate-folder-detail"><div className="cost-estimate-summary"><article><span>Estimated Sarvam</span><b>{formatEstimate(costEstimateDockTotals.sarvamInr,'INR')}</b><small>Dubbing, transcription and translation</small></article><article><span>Estimated Gemini</span><b>{formatEstimate(costEstimateDockTotals.geminiUsd,'USD')}</b><small>Transcript and audio review</small></article></div><div className="cost-estimate-table-wrap"><table className="cost-estimate-table"><thead><tr><th>Video</th><th>Workflow</th><th>Length</th><th>Sarvam</th><th>Gemini</th></tr></thead><tbody>{costEstimateDockRows.length?costEstimateDockRows.map(row=><tr key={row.key}><td><b>{row.project.title}</b><small>{folders.find(folder=>folder.id===row.project.folderId)?.name} · {row.project.source} → {row.project.target} · {row.project.status}</small></td><td><select aria-label={`Workflow for ${row.project.title}`} value={row.mode} onChange={event=>setCostWorkflowModes(current=>({...current,[row.key]:event.target.value as 'sarvam'|'review'}))}><option value="sarvam">Sarvam dub + QA</option><option value="review">Existing dub QA</option></select></td><td><label className="cost-duration-field"><input aria-label={`Video length in minutes for ${row.project.title}`} type="number" min="0.01" step="0.1" value={costDurations[row.key]||''} placeholder="Minutes" onChange={event=>updateCostDuration(row.key,event.target.value)}/><span>min</span></label></td><td>{row.sarvamInr===null?'—':formatEstimate(row.sarvamInr,'INR')}</td><td>{row.geminiUsd===null?'—':formatEstimate(row.geminiUsd,'USD')}</td></tr>):<tr><td colSpan={5} className="cost-empty">No videos are saved in this project folder yet.</td></tr>}</tbody></table></div></div>
        <details className="cost-rate-details" open={!costEstimateSelectedFolderId}><summary><Calculator size={14}/> Technologies and estimate assumptions</summary><div className="cost-rate-grid"><label><span>Sarvam dubbing · ₹/min</span><input type="number" min="0" step="0.1" value={costRates.dubbingPerMinute} onChange={event=>setCostRates(current=>({...current,dubbingPerMinute:Number(event.target.value)}))}/></label><label><span>Saaras v4 · ₹/track min</span><input type="number" min="0" step="0.01" value={costRates.speechToTextPerMinute} onChange={event=>setCostRates(current=>({...current,speechToTextPerMinute:Number(event.target.value)}))}/></label><label><span>Translate · ₹/1,000 chars</span><input type="number" min="0" step="0.1" value={costRates.translatePerThousandCharacters} onChange={event=>setCostRates(current=>({...current,translatePerThousandCharacters:Number(event.target.value)}))}/></label><label><span>Estimated chars per minute</span><input type="number" min="0" step="100" value={costRates.charactersPerMinute} onChange={event=>setCostRates(current=>({...current,charactersPerMinute:Number(event.target.value)}))}/></label><label><span>Gemini input · $/1M tokens</span><input type="number" min="0" step="0.01" value={costRates.geminiInputUsdPerMillion} onChange={event=>setCostRates(current=>({...current,geminiInputUsdPerMillion:Number(event.target.value)}))}/></label><label><span>Gemini output · $/1M tokens</span><input type="number" min="0" step="0.01" value={costRates.geminiOutputUsdPerMillion} onChange={event=>setCostRates(current=>({...current,geminiOutputUsdPerMillion:Number(event.target.value)}))}/></label></div><div className="cost-tech-list"><span><b>Sarvam Dubbing API</b> · dubbing jobs, source duration billed; `editor_flow: false`.</span><span><b>Sarvam Saaras v4</b> · timestamped transcription. Generated dubs reuse the Sarvam subtitle transcript; existing-dub reviews transcribe both tracks.</span><span><b>Sarvam Translate v1</b> · dub back-translation, estimated from characters per minute.</span><span><b>Gemini {preflight?.geminiModel || '3.8 Flash'}</b> · transcript comparison and audio listening, estimated from input/output tokens per minute.</span><span><b>FFmpeg, Vercel Workflows, Blob, and Supabase</b> · hosting, processing, transfer, and storage charges are not included.</span></div><p className="cost-rate-note">Rates are estimates and may differ from your provider plan. Sarvam is shown in INR, Gemini in USD. Actual token and character usage varies. Excludes GST.</p><div className="cost-source-links"><a href="https://docs.sarvam.ai/api/getting-started/pricing" target="_blank" rel="noreferrer">Sarvam pricing</a><a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Gemini pricing</a></div></details><footer className="cost-estimate-footer"><span>Video estimates are saved in this browser for each project folder.</span><button type="button" onClick={closeCostEstimator}>Done</button></footer></section></div>}
      {notice && <div className="toast"><Check size={16}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}

      {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setModal(false);setOriginalFile(null);setDubbedFile(null);setPreflight(null)}}}><form className="create-modal" onSubmit={runAnalysis}>
        <button type="button" className="modal-close icon-btn" onClick={()=>{if(!busy){setModal(false);setOriginalFile(null);setDubbedFile(null);setPreflight(null)}}} aria-label="Close"><X size={18}/></button><div className="section-kicker">SARVAM DUBBING + AI QUALITY REVIEW</div><h2>{generationMode === 'sarvam' ? 'Generate a dub with Sarvam' : 'Review an existing dub'}</h2>
        <p className="modal-intro">{generationMode === 'sarvam' ? 'Upload your source video and choose the language for the Sarvam dub.' : 'Upload the original video and the dubbed version you want to review.'}</p>

        <label className="field-label">Video name <span>AUTOMATIC</span><input className="text-input" value={projectName} readOnly aria-readonly="true" /></label>
        <label className="field-label">Save in folder<select value={projectFolderId} onChange={event=>setProjectFolderId(event.target.value)}><option value="">No folder</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        <div className="language-fields"><label className="field-label">Source language<select value={source} onChange={e=>{setSource(e.target.value);setProjectName(`${e.target.value} to ${target}`)}}>{['Hindi','English','Marathi','Bengali','Gujarati','Tamil','Telugu','Kannada','Punjabi','Malayalam','Odia','Assamese','Urdu','Sanskrit','Nepali'].map(language=><option key={language}>{language}</option>)}</select></label><label className="field-label">Target language<select value={target} onChange={e=>{setTarget(e.target.value);setProjectName(`${source} to ${e.target.value}`)}}>{languages.map(language=><option key={language}>{language}</option>)}</select></label></div>
        <div className="video-upload-grid"><label className="upload-box"><input type="file" accept="video/*,audio/*" onChange={e=>{setOriginalFile(e.target.files?.[0] ?? null);setPreflight(null)}}/><span className="upload-icon"><Upload size={19}/></span><b>{originalFile?.name || 'Choose original video'}</b><small>{originalFile ? `${(originalFile.size/1024/1024).toFixed(1)} MB · ready` : 'Source language audio/video'}</small><span className="upload-formats"><FileAudio size={12}/> MP4, MOV, MP3, WAV</span></label>
          {generationMode==='existing' && <label className="upload-box"><input type="file" accept="video/*,audio/*" onChange={e=>{setDubbedFile(e.target.files?.[0] ?? null);setPreflight(null)}}/><span className="upload-icon"><FileAudio size={19}/></span><b>{dubbedFile?.name || 'Choose dubbed video'}</b><small>{dubbedFile ? `${(dubbedFile.size/1024/1024).toFixed(1)} MB · ready` : 'Target language audio/video'}</small><span className="upload-formats"><FileAudio size={12}/> MP4, MOV, MP3, WAV</span></label>}
        </div>
        <div className="privacy-note"><ShieldCheck size={15}/><span>{generationMode==='sarvam' ? 'Sarvam receives the original and generates a target-language video dub (usage may be billed to your Sarvam account). The app then transcribes both and asks Gemini to compare the audio.' : 'Sarvam transcribes both videos; Gemini listens to both audio tracks and reports suspected meaning, pronunciation, pacing, and audio issues with timestamps.'}</span></div>
        {preflight && <div className="preflight-card" role="status"><b>Ready check passed · {preflight.geminiModel} responded</b><span>Estimated Blob space needed: {(preflight.storage.requiredBytes/1024/1024).toFixed(1)} MB including reserve. Available: {(preflight.storage.availableBytes/1024/1024).toFixed(1)} MB.</span>{preflight.cleanupNeeded ? <span className="preflight-warning">To make room, confirmation will delete inactive video/audio files from earlier jobs. Reports and active jobs are kept; old video playback/download links will stop working.</span> : <span>No old media needs to be cleared.</span>}<small>{preflight.limitations} This check uses a small Gemini request; Sarvam credits are not checked or reserved. Check Sarvam Dashboard → Billing before confirming.</small></div>}
        {busy && !checkingReadiness && <div className="analysis-progress" role="status" aria-live="polite"><div className="progress-heading"><b>{analysisProgress.stage || 'Preparing your analysis'}</b><span>{Math.min(100, analysisProgress.percent)}%</span></div><div className="progress-track" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={analysisProgress.percent}><span style={{width: `${analysisProgress.percent}%`}} /></div><div className="progress-meta"><span>Elapsed {formatDuration(elapsedSeconds)}</span><b>{remainingEstimate(estimatedRange, elapsedSeconds)}</b></div><small>Time is an estimate; Sarvam dubbing, transcription and AI review can take several minutes.</small></div>}
        <button className="primary-btn modal-submit" type="submit" disabled={busy}>{busy?<><span className="spinner"/> {checkingReadiness?'Checking providers…':analysisProgress.stage?.toLowerCase().includes('storage')?'Checking storage…':generationMode==='sarvam'&&analysisProgress.percent<74?'Preparing / generating dub…':'AI listening & comparing…'}</>:<>{preflight ? (preflight.cleanupNeeded ? 'Clear old media & start' : 'Confirm & start job') : 'Check readiness first'} <ArrowRight size={15}/></>}</button>
      </form></div>}      {details && <div className={reportPage ? "report-page-backdrop" : "modal-backdrop"} onMouseDown={e=>{if(!reportPage&&e.target===e.currentTarget){setDetails(null);setReportPage(false)}}}><div className={reportPage ? "report-page-content detail-modal" : "detail-modal"}>{reportPage && <button type="button" className="report-back-button" onClick={()=>{setReportPage(false);setReportDeleteConfirmOpen(false);setDetails(null)}}><ArrowLeft size={16}/> Back to projects</button>}<button className="modal-close icon-btn" onClick={()=>{setDetails(null);setReportPage(false)}} aria-label="Close"><X size={18}/></button><div className="detail-topline"><span className="eyebrow-line"/> DUB VIDEO QA REPORT <span className={`status-pill${details.status==='Failed' ? ' failed' : report?.findings.length ? ' needs-review' : ' ready'}`}><i/>{details.status==='Failed' ? 'Failed' : report ? report.findings.length ? `${report.findings.length} ${report.findings.length === 1 ? 'finding' : 'findings'}` : 'No findings' : (details.isExample ? 'Example' : 'Loading report')}</span><div className="archive-actions">{reportPage && !details.isExample && <div className="report-delete-control">{reportDeleteConfirmOpen ? <div className="report-delete-confirm" role="group" aria-label="Confirm project deletion"><span>Delete this project and its saved files?</span><button type="button" onClick={()=>setReportDeleteConfirmOpen(false)} disabled={deletingProjectId===details.jobId}>Cancel</button><button type="button" className="report-delete-confirm-action" onClick={()=>void deleteProject(details)} disabled={deletingProjectId===details.jobId}>{deletingProjectId===details.jobId?"Deleting…":"Delete permanently"}</button></div> : <button type="button" className="report-delete-button" onClick={()=>setReportDeleteConfirmOpen(true)}><Trash2 size={14}/>Delete project</button>}</div>}<button type="button" className="icon-btn" aria-label="Dub output actions" aria-expanded={archiveMenuOpen} onClick={()=>setArchiveMenuOpen(open=>!open)}><MoreHorizontal size={18}/></button>{archiveMenuOpen && <div className="archive-dropdown"><button type="button" onClick={()=>{setRenameProjectValue(details.title);setRenameProjectOpen(true);setArchiveMenuOpen(false)}}><Pencil size={14}/>Rename project</button>{report?.dubbedVideoUrl && <button type="button" onClick={archiveFullReportToB2} disabled={archiveBusy}><ExternalLink size={14}/>{archiveBusy ? 'Saving full report...' : report?.reportB2Key ? 'Ensure Backblaze B2 archive & clear Vercel' : b2Configured ? 'Archive full report to Backblaze B2 & clear Vercel' : 'Archive full report to Backblaze B2'}</button>}{!report?.dubbedVideoUrl && <span>No dubbed output is available.</span>}</div>}</div></div>{renameProjectOpen ? <form className="rename-project-form" onSubmit={saveProjectName}><label><span>Project name</span><input value={renameProjectValue} onChange={event=>setRenameProjectValue(event.target.value)} maxLength={120} required autoFocus /></label><div><button type="submit" disabled={renameProjectBusy}>{renameProjectBusy ? 'Saving…' : 'Save name'}</button><button type="button" onClick={()=>setRenameProjectOpen(false)} disabled={renameProjectBusy}>Cancel</button></div></form> : <h2>{details.title}</h2>}<p className="detail-language">{details.source} source <ArrowRight size={14}/> {details.target} dub <span>·</span> {details.date}</p>{details.status!=='Failed' && <div className="detail-explain">{details.isExample ? <span>This shared, read-only sample previews the project list. No customer video or report is attached.</span> : <span>{audioReviewSummary}</span>}</div>}<div className="detail-section-title"><b>{details.status==='Failed'?'Job failed':details.isExample ? 'Example preview' : 'Automated findings'}</b><span>{details.status==='Failed'?details.isExample ? 'No report attached' : 'QA report unavailable':`${report?.findings.length ?? 0} flags`}</span></div>{details.status==='Failed' && <div className="job-failure" role="alert"><AlertCircle size={18}/><div><b>{details.dubbedVideoUrl ? 'QA did not finish, but your dub is safe' : 'The dubbing job did not complete'}</b><p>{details.errorMessage || 'Open the project to load the failure details.'}</p></div></div>}{details.status==='Failed' && (details.originalVideoUrl || details.dubbedVideoUrl) && <div className="failed-dub-available"><div><b>Your original and saved dub are available</b><p>QA failed, but you can still watch and download the videos.</p></div><div className="failed-video-grid">{details.originalVideoUrl && <section><b>Original &middot; {details.source}</b><video controls preload="metadata" src={details.originalVideoUrl}/><a className="secondary-btn" href={details.originalVideoUrl} download={`${details.title.replace(/[^\w-]+/g, '-')}-${details.source.toLowerCase()}-original.mp4`}><ArrowDownToLine size={15}/> Download original</a></section>}{details.dubbedVideoUrl && <section><b>Sarvam dub &middot; {details.target}</b><video controls preload="metadata" src={details.dubbedVideoUrl}/><a className="secondary-btn" href={details.dubbedVideoUrl} download={`${details.title.replace(/[^\w-]+/g, '-')}-${details.target.toLowerCase()}-dub.mp4`}><ArrowDownToLine size={15}/> Download Sarvam dub</a></section>}</div></div>}{(report?.findings ?? []).map((issue,index)=><div className="detail-issue" key={`${issue.title}-${index}`}><div className={cx('severity-mark',issue.severity)}>{issue.severity==='critical'?<Zap size={14}/>:<Activity size={14}/>}</div><div><b>{issue.title}</b><p>{findingDetail(issue)}</p>{(issue.sourceQuote || issue.dubQuote) && <div className="finding-phrases">{issue.sourceQuote && <span><b>Source phrase</b> {issue.sourceQuote}</span>}{issue.dubQuote && <span><b>Dub phrase heard</b> {issue.dubQuote}</span>}</div>}<small>{issue.category ?? issue.source ?? 'Transcript check'}{issue.source && issue.category ? ` | ${issue.source === 'Transcript checks' || issue.source === 'Gemini transcript cross-check' ? 'Transcript comparison' : issue.source === 'Gemini audio review' ? 'Audio review' : issue.source}` : ''}{issue.evidenceStatus ? ` · ${issue.evidenceStatus === 'cross-checked' ? 'audio and transcript checks found this' : issue.evidenceStatus === 'audio-only' ? 'flagged while listening to the audio' : 'transcript check only · listen to confirm'}` : ''}</small>{(findingTimeRange(issue,report?.originalSegments ?? [],'source').start!==undefined || findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!==undefined) && <div className="finding-time-links">{findingTimeRange(issue,report?.originalSegments ?? [],'source').start!==undefined && <button title="Plays from 10 seconds before to 10 seconds after this finding" aria-label={playingClip === clipKey('source-review-video',findingTimeRange(issue,report?.originalSegments ?? [],'source').start!,findingTimeRange(issue,report?.originalSegments ?? [],'source').end) ? 'Pause source clip' : 'Play source clip'} onClick={()=>playSegment('source-review-video',findingTimeRange(issue,report?.originalSegments ?? [],'source').start!,findingTimeRange(issue,report?.originalSegments ?? [],'source').end,true)}>Source {issue.evidenceStatus === 'transcript-only' ? '~' : ''}{formatTime(findingTimeRange(issue,report?.originalSegments ?? [],'source').start!)}{issue.sourceEnd!==undefined ? `–${formatTime(findingTimeRange(issue,report?.originalSegments ?? [],'source').end!)}` : ''} {playingClip === clipKey('source-review-video',findingTimeRange(issue,report?.originalSegments ?? [],'source').start!,findingTimeRange(issue,report?.originalSegments ?? [],'source').end) ? <Pause size={11}/> : <Play size={11}/>}</button>}{findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!==undefined && <button title="Plays from 10 seconds before to 10 seconds after this finding" aria-label={playingClip === clipKey('dub-review-video',findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!,findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end) ? 'Pause dub clip' : 'Play dub clip'} onClick={()=>playSegment('dub-review-video',findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!,findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end,true)}>Dub {issue.evidenceStatus === 'transcript-only' ? '~' : ''}{formatTime(findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!)}{issue.dubEnd!==undefined ? `–${formatTime(findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end!)}` : ''} {playingClip === clipKey('dub-review-video',findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').start!,findingTimeRange(issue,report?.dubbedSegments ?? [],'dub').end) ? <Pause size={11}/> : <Play size={11}/>}</button>}</div>}</div></div>)}{report && <><div className="audio-review-grid"><label><b>Original · {report.sourceLanguage}</b><video id="source-review-video" controls preload="metadata" src={report.originalVideoUrl ?? undefined} onPause={()=>setPlayingClip(null)} /></label>{report.dubbedVideoUrl ? <label><b>Dub &middot; {report.targetLanguage}</b><video id="dub-review-video" controls preload="metadata" src={report.dubbedVideoUrl ?? undefined} onPause={()=>setPlayingClip(null)} /></label> : <p className="no-timestamps">Dub media is no longer available.</p>}</div><details className="transcript-details"><summary>Show transcript evidence (supporting evidence, not the verdict)</summary><div className="transcript-results"><div><b>Original transcript · {report.sourceLanguage}</b><p>{report.originalTranscript}</p></div><div><b>Dub transcript · {report.targetLanguage}</b><p>{report.dubbedTranscript}</p></div><div><b>Dub back-translated to {report.sourceLanguage}</b><p>{report.backTranslation}</p></div></div></details></>}<div className="detail-actions">{report?.generatedBySarvam && report.dubbedVideoUrl && <a className="secondary-btn" href={report.dubbedVideoUrl} download={`${report.project.replace(/[^\w-]+/g, "-")}-${report.targetLanguage.toLowerCase()}-dub.mp4`}><ArrowDownToLine size={15}/> Download Sarvam dub</a>}{report?.dubbedVideoUrl && <button className="secondary-btn" onClick={archiveFullReportToB2} disabled={archiveBusy}><ExternalLink size={15}/>{archiveBusy ? 'Saving to Backblaze B2...' : report?.reportB2Key ? 'Ensure Backblaze B2 archive & clear Vercel' : b2Configured ? 'Archive full report to Backblaze B2' : 'Archive full report to Backblaze B2'}</button>}<button className="secondary-btn" onClick={exportReport}><ArrowDownToLine size={15}/> Export JSON report</button>{details.status==='Failed' && (details.dubbedAvailable || details.dubbedVideoUrl || /QA request timed out|QA failed|QA returned/i.test(details.errorMessage || '')) ? <button className="primary-btn" onClick={()=>void retrySavedDubQa(details)} disabled={retryingQaJobId===details.jobId}>{retryingQaJobId===details.jobId ? <><LoaderCircle className="spin" size={15}/> Starting QA retry...</> : <><Activity size={15}/> Retry QA with saved dub</>}</button> : <button className="primary-btn" onClick={()=>{setDetails(null);setReportPage(false)}}><Check size={15}/> Done</button>}</div></div></div>}
    </ProductDashboardShell>
  );
}
