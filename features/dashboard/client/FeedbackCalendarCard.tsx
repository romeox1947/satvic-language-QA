'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, Link2, MessageSquare, Video, X } from 'lucide-react';

export type FeedbackEntry = {
  id: string;
  submittedAt: string;
  videoName: string;
  timestamp: string;
  reportedText: string;
  suggestedText?: string;
  note?: string;
  respondent?: string;
};

type Props = { entries?: FeedbackEntry[]; formUrl?: string | null; onSaveFormUrl?: (url: string) => Promise<void> };

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function FeedbackCalendarCard({ entries = [], formUrl = '', onSaveFormUrl }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formSettingsOpen, setFormSettingsOpen] = useState(false);
  const [formUrlDraft, setFormUrlDraft] = useState(formUrl || '');
  const [formUrlSaving, setFormUrlSaving] = useState(false);
  const [formUrlError, setFormUrlError] = useState('');
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const groupedEntries = useMemo(() => entries.reduce<Record<string, FeedbackEntry[]>>((grouped, entry) => {
    const key = dateKey(new Date(entry.submittedAt));
    grouped[key] = [...(grouped[key] || []), entry];
    return grouped;
  }, {}), [entries]);
  const selectedEntries = selectedDate ? groupedEntries[selectedDate] || [] : [];
  const selectedLabel = selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';

  useEffect(() => setFormUrlDraft(formUrl || ''), [formUrl]);

  async function saveFormUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSaveFormUrl || formUrlSaving) return;
    setFormUrlSaving(true);
    setFormUrlError('');
    try {
      await onSaveFormUrl(formUrlDraft.trim());
      setFormSettingsOpen(false);
    } catch (error) {
      setFormUrlError(error instanceof Error ? error.message : 'Could not save the form link.');
    } finally {
      setFormUrlSaving(false);
    }
  }

  async function removeFormUrl() {
    if (!onSaveFormUrl || formUrlSaving) return;
    setFormUrlSaving(true);
    setFormUrlError('');
    try {
      await onSaveFormUrl('');
      setFormUrlDraft('');
      setFormSettingsOpen(false);
    } catch (error) {
      setFormUrlError(error instanceof Error ? error.message : 'Could not remove the form link.');
    } finally {
      setFormUrlSaving(false);
    }
  }

  function shiftMonth(direction: number) {
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + direction, 1));
    setSelectedDate(null);
  }

  return <article className="feedback-calendar-card" aria-label="Video feedback calendar">
    <header className="feedback-card-heading">
      <div className="feedback-card-title"><span className="feedback-card-icon"><MessageSquare size={16}/></span><div><span className="feedback-card-kicker">VIDEO FEEDBACK</span><h2>Community reports</h2></div></div>
      <div className="feedback-card-actions">{selectedDate && <button type="button" className="feedback-back-button" onClick={() => setSelectedDate(null)}><ArrowLeft size={13}/> Calendar</button>}<span className="feedback-response-count">{entries.length} reports</span>{formUrl ? <a className="feedback-form-link" href={formUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/> Report an issue</a> : <button type="button" className="feedback-form-link" onClick={() => { setFormUrlDraft(''); setFormUrlError(''); setFormSettingsOpen(true); }}><Link2 size={12}/> Add form link</button>}{formUrl && onSaveFormUrl && <button type="button" className="feedback-form-edit" aria-label="Edit form link" title="Edit form link" onClick={() => { setFormUrlDraft(formUrl); setFormUrlError(''); setFormSettingsOpen(true); }}><Link2 size={13}/></button>}</div>
    </header>

    {formSettingsOpen && <form className="feedback-form-settings" onSubmit={saveFormUrl}><div className="feedback-form-settings-heading"><b>{formUrl ? 'Update feedback form' : 'Add a feedback form'}</b><button type="button" aria-label="Close form link settings" onClick={() => setFormSettingsOpen(false)}><X size={14}/></button></div><label>Google Form URL<input type="url" value={formUrlDraft} onChange={event => setFormUrlDraft(event.target.value)} placeholder="https://docs.google.com/forms/..." required autoFocus /></label>{formUrlError && <p role="alert">{formUrlError}</p>}<div className="feedback-form-settings-actions">{formUrl && <button type="button" className="feedback-remove-form" disabled={formUrlSaving} onClick={() => void removeFormUrl()}>Remove link</button>}<button type="submit" disabled={formUrlSaving || !formUrlDraft.trim()}>{formUrlSaving ? 'Saving…' : 'Save link'}</button></div></form>}

    {selectedDate ? <section className="feedback-day-view" aria-live="polite">
      <div className="feedback-day-heading"><span className="feedback-card-kicker">SUBMISSIONS</span><h3>{selectedLabel}</h3><p>{selectedEntries.length ? `${selectedEntries.length} feedback ${selectedEntries.length === 1 ? 'report' : 'reports'}` : 'No feedback was submitted on this day.'}</p></div>
      {selectedEntries.length ? <div className="feedback-entry-list">{selectedEntries.map(entry => <article className="feedback-entry" key={entry.id}>
        <div className="feedback-entry-meta"><span><Video size={13}/>{entry.videoName}</span><span><Clock3 size={13}/>{entry.timestamp}</span></div>
        <div className="feedback-entry-field"><small>Reported word or option</small><b>{entry.reportedText}</b></div>
        {entry.suggestedText && <div className="feedback-entry-field"><small>Suggested correction</small><b>{entry.suggestedText}</b></div>}
        {entry.note && <p className="feedback-entry-note">{entry.note}</p>}
        {entry.respondent && <small className="feedback-respondent">Submitted by {entry.respondent}</small>}
      </article>)}</div> : <div className="feedback-empty-day"><MessageSquare size={20}/><span>Choose a purple date to view submitted feedback.</span></div>}
    </section> : <>
      <div className="feedback-calendar-toolbar"><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={16}/></button><b>{monthLabel}</b><button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={16}/></button></div>
      <div className="feedback-calendar-grid" role="grid" aria-label={monthLabel}>
        {['S','M','T','W','T','F','S'].map((day, index) => <span className="feedback-weekday" key={`${day}-${index}`} role="columnheader">{day}</span>)}
        {Array.from({ length: firstWeekday }, (_, index) => <span className="feedback-day-spacer" key={`blank-${index}`} aria-hidden="true"/>)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const key = dateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
          const count = groupedEntries[key]?.length || 0;
          const isToday = key === dateKey(new Date());
          return <button type="button" role="gridcell" key={key} className={`feedback-day${count ? ' has-feedback' : ''}${isToday ? ' today' : ''}`} aria-label={`${key}${count ? `, ${count} feedback reports` : ', no feedback'}`} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)}><span>{day}</span>{count > 0 && <i>{count > 9 ? '9+' : count}</i>}</button>;
        })}
      </div>
      <footer className="feedback-calendar-footer"><span><i/> Feedback received</span><small>{entries.length ? 'Select a marked date to review responses.' : 'Submitted form responses will appear here.'}</small></footer>
      {!entries.length && <div className="feedback-connect-hint"><CalendarDays size={15}/><span>Link the form response sheet to show viewer reports here.</span></div>}
    </>}
  </article>;
}
