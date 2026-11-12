'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Paperclip, Square, X } from 'lucide-react';

type FounderPromptBarProps = {
  busy?: boolean;
  onSend: (text: string, files: File[]) => void;
  onStop: () => void;
};

export default function FounderPromptBar({ busy = false, onSend, onStop }: FounderPromptBarProps) {
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = Boolean(draft.trim() || files.length);

  function submit() {
    if (busy) { onStop(); return; }
    if (!ready) return;
    onSend(draft.trim(), files);
    setDraft('');
    setFiles([]);
    if (inputRef.current) inputRef.current.style.height = '24px';
    if (fileRef.current) fileRef.current.value = '';
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return <div className={`founder-prompt-bar${busy ? ' is-busy' : ''}`}>
    <input ref={fileRef} type="file" multiple hidden onChange={event => setFiles(current => [...current, ...Array.from(event.target.files ?? [])])}/>
    {files.length > 0 && <div className="founder-prompt-files">{files.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={12}/>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><X size={12}/></button></span>)}</div>}
    <textarea ref={inputRef} rows={1} value={draft} disabled={busy} placeholder="Describe a goal, idea, or problem…" aria-label="Message Founder Mind" onChange={event => { setDraft(event.target.value); const el = event.currentTarget; el.style.height = '24px'; el.style.height = `${Math.min(el.scrollHeight, 96)}px`; }} onKeyDown={onKeyDown}/>
    <div className="founder-prompt-tools"><button type="button" aria-label="Attach files" title="Attach files" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip size={17}/></button><span>Shift + Enter for a new line</span><button type="button" className="founder-prompt-send" aria-label={busy ? 'Stop thinking' : 'Send'} title={busy ? 'Stop' : 'Send'} disabled={!busy && !ready} onClick={submit}>{busy ? <Square size={14} fill="currentColor"/> : <ArrowUp size={18}/>}</button></div>
  </div>;
}
