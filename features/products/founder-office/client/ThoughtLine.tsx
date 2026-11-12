'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Sparkles, Check } from 'lucide-react';

type ThoughtLineProps = {
  working: boolean;
  steps?: string[];
  label?: string;
  doneLabel?: string;
  glyph?: 'sparkle' | 'dot' | 'none';
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
  settleDuration?: number;
  settleBlur?: number;
  collapsible?: boolean;
  collapseOnSettle?: boolean;
  showTimer?: boolean;
  onSettle?: (seconds: number) => void;
};

function formatTime(seconds: number) {
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
}

export default function ThoughtLine({
  working, steps = [], label = 'Thinking…', doneLabel = 'Thought for', glyph = 'sparkle',
  fontSize = 16, breathPeriod = 1.6, breathDepth = 0.45, settleDuration = 350,
  settleBlur = 2, collapsible = true, collapseOnSettle = true, showTimer = true, onSettle,
}: ThoughtLineProps) {
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(true);
  const startedAt = useRef(0);

  useEffect(() => {
    if (working) {
      startedAt.current = performance.now();
      setElapsed(0);
      setOpen(true);
      const timer = window.setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
      return () => window.clearInterval(timer);
    }
    if (collapseOnSettle) setOpen(false);
    if (startedAt.current) onSettle?.((performance.now() - startedAt.current) / 1000);
    return undefined;
  }, [working, collapseOnSettle, onSettle]);

  const style = {
    '--tl-font': `${fontSize}px`, '--tl-breath-period': `${breathPeriod}s`,
    '--tl-breath-depth': breathDepth, '--tl-settle': `${settleDuration}ms`,
    '--tl-blur': `${settleBlur}px`,
  } as CSSProperties;

  return <div className={`thought-line${working ? ' is-working' : ''}${open && steps.length ? ' is-open' : ''}`} style={style}>
    <button type="button" className="thought-line-head" aria-expanded={steps.length ? open : undefined} onClick={() => collapsible && steps.length && setOpen(value => !value)}>
      {glyph === 'sparkle' && <Sparkles className="thought-line-glyph" size={17} />}
      {glyph === 'dot' && <i className="thought-line-dot"/>}
      <span className="thought-line-label">{working ? label : doneLabel}</span>
      {showTimer && <span className="thought-line-timer">{working ? formatTime(elapsed) : formatTime(elapsed)}</span>}
      {collapsible && steps.length > 0 && <ChevronDown className="thought-line-chevron" size={15}/>}
    </button>
    {steps.length > 0 && <div className="thought-line-trace"><div className="thought-line-steps">{steps.map((step, index) => <div className="thought-line-step" key={step}><span className="thought-line-check">{!working || index < steps.length - 1 ? <Check size={13}/> : <i/>}</span>{step}</div>)}</div></div>}
    <span className="sr-only" role="status" aria-live="polite">{working ? label : `${doneLabel} ${formatTime(elapsed)}`}</span>
  </div>;
}
