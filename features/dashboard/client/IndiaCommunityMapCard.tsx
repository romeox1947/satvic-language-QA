'use client';

import { useMemo, useState } from 'react';
import { renderIndiaSvg } from 'vardhan-maps/svg';
import { stateList } from 'vardhan-maps/data';

export type IndiaMapProject = {
  target: string;
  status: 'Needs review' | 'In progress' | 'Ready' | 'Failed' | 'Example';
  issues: number;
  createdAt?: string;
};

const neutralState = '#dfe3df';
const statusColors = {
  review: '#5950cc',
  failed: '#e9aaa5',
  processing: '#8b68b8',
  ready: '#6e9b72',
  neutral: neutralState,
};

const targetStates: Record<string, string[]> = {
  Assamese: ['Assam'],
  Bengali: ['West Bengal'],
  Gujarati: ['Gujarat'],
  Kannada: ['Karnataka'],
  Malayalam: ['Kerala'],
  Marathi: ['Maharashtra'],
  Odia: ['Odisha'],
  Punjabi: ['Punjab'],
  Tamil: ['Tamil Nadu'],
  Telugu: ['Andhra Pradesh', 'Telangana'],
  Hindi: ['Bihar', 'Chhattisgarh', 'Delhi', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Madhya Pradesh', 'Rajasthan', 'Uttar Pradesh', 'Uttarakhand'],
};

type Props = { projects?: IndiaMapProject[]; compact?: boolean };
type MapStatus = 'review' | 'failed' | 'processing' | 'ready';

export function languagesForIndiaState(stateName: string): string[] {
  return Object.entries(targetStates).filter(([, states]) => states.includes(stateName)).map(([language]) => language);
}

function statusForState(stateName: string, projects: IndiaMapProject[]): MapStatus | null {
  const languages = Object.entries(targetStates).filter(([, states]) => states.includes(stateName)).map(([language]) => language);
  const stateProjects = projects.filter(project => languages.includes(project.target) && project.status !== 'Example');
  if (!stateProjects.length) return null;
  const latestProject = stateProjects.reduce((latest, project) => {
    if (!project.createdAt) return latest;
    if (!latest.createdAt) return project;
    return Date.parse(project.createdAt) > Date.parse(latest.createdAt) ? project : latest;
  }, stateProjects[0]);
  if (latestProject.status === 'Failed') return 'failed';
  if (latestProject.status === 'In progress') return 'processing';
  if (latestProject.status === 'Needs review') return 'review';
  if (latestProject.status === 'Ready' && latestProject.issues === 0) return 'ready';
  return null;
}

function statusTitle(stateName: string, status: string | null) {
  if (status === 'review') return `${stateName} · Dub complete, needs review`;
  if (status === 'failed') return `${stateName} · Dub failed`;
  if (status === 'processing') return `${stateName} · Dub in progress`;
  if (status === 'ready') return `${stateName} · No mistake`;
  return `${stateName} · No dub activity`;
}

export default function IndiaCommunityMapCard({ projects = [], compact = false, selectedState, onStateSelect }: Props & { selectedState?: string | null; onStateSelect?: (state: string | null) => void }) {
  const [localSelectedState, setLocalSelectedState] = useState('Maharashtra');
  const activeState = selectedState === undefined ? localSelectedState : selectedState;
  const selectState = (state: string) => {
    const next = activeState === state ? null : state;
    if (selectedState === undefined) setLocalSelectedState(next || '');
    onStateSelect?.(next);
  };
  const mapSvg = useMemo(() => {
    const svg = renderIndiaSvg({
      level: 'state',
      width: 350,
      height: 390,
      padding: 9,
      stateStyle: { stroke: '#ffffff', strokeWidth: 1.8 },
      stateFill: name => {
        if (compact) return statusColors[statusForState(name, projects) || 'neutral'];
        return !compact && name === activeState ? '#8963ad' : neutralState;
      },
    });
    if (!compact) return svg;
    return svg.replace(/<title>([^<]+)<\/title>/g, (_match, name: string) => {
      const status = statusForState(name, projects);
      const selected = name === activeState ? ' data-selected="true"' : '';
      return `<title${selected}>${statusTitle(name, status)}</title>`;
    });
  }, [compact, projects, activeState]);

  if (compact) return <article className="so-card so-global-card so-india-card so-india-status-card">
    <div className="so-card-heading"><h2>Dub status across India</h2></div>
    <div className="so-india-map" role="group" aria-label="Select an Indian state to filter project videos" onClick={event => {
      if (!(event.target instanceof Element)) return;
      const stateName = event.target.closest('path')?.querySelector('title')?.textContent?.split(' Â· ')[0];
      const matchedState = stateList.find(state => stateName?.startsWith(state.name));
      if (matchedState) selectState(matchedState.name);
    }} dangerouslySetInnerHTML={{ __html: mapSvg }}/>
    {activeState && <div className="so-india-filter-note"><span><i aria-hidden="true"/> {activeState} selected · showing matching videos</span><button type="button" onClick={() => { if (selectedState === undefined) setLocalSelectedState(''); onStateSelect?.(null); }}>Clear filter</button></div>}
  </article>;

  return <article className="so-card so-global-card so-india-card">
    <div className="so-card-heading">
      <div><span className="so-card-kicker">COMMUNITY ACROSS INDIA</span><h2>Explore by state</h2></div>
    </div>
    <div className="so-india-content">
      <div className="so-india-map" aria-label="Interactive map of India's states and union territories" onClick={event => {
        if (!(event.target instanceof Element)) return;
        const stateName = event.target.closest('path')?.querySelector('title')?.textContent?.split(' · ')[0];
        const matchedState = stateList.find(state => stateName?.startsWith(state.name));
        if (matchedState) selectState(matchedState.name);
      }} dangerouslySetInnerHTML={{ __html: mapSvg }}/>
      <div className="so-india-state-panel">
        <div className="so-india-state-summary"><strong>{selectedState}</strong><span>{stateList.length} states &amp; union territories</span></div>
        <div className="so-india-state-list" aria-label="Choose a state">
          {stateList.map(state => <button key={state.slug} type="button" className={activeState === state.name ? 'active' : ''} aria-pressed={activeState === state.name} onClick={() => selectState(state.name)}>{state.name}</button>)}
        </div>
      </div>
    </div>
    <a className="so-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
  </article>;
}
