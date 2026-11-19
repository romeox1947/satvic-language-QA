'use client';

import { useState, type MouseEvent } from 'react';
import { renderIndiaSvg } from 'vardhan-maps/svg';
import { stateList } from 'vardhan-maps/data';
import { ArrowUpRight } from 'lucide-react';

const stateColors = ['#dfd3ec', '#ead9c8', '#d7e2d4', '#e9e4c8', '#d5dfeb', '#e6d9de'];

export default function IndiaCommunityMapCard() {
  const [selectedState, setSelectedState] = useState('Maharashtra');
  const mapSvg = renderIndiaSvg({
    level: 'state',
    width: 350,
    height: 390,
    padding: 9,
    stateStyle: { stroke: '#ffffff', strokeWidth: 1.8 },
    stateFill: name => name === selectedState ? '#8963ad' : stateColors[stateList.findIndex(state => state.name === name) % stateColors.length],
  });

  const selectMapState = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const stateName = event.target.closest('path')?.querySelector('title')?.textContent;
    if (stateName && stateList.some(state => state.name === stateName)) setSelectedState(stateName);
  };

  return <article className="so-card so-global-card so-india-card">
    <div className="so-card-heading">
      <div><span className="so-card-kicker">COMMUNITY ACROSS INDIA</span><h2>Explore by state</h2></div>
      <button className="so-text-action" type="button" aria-label="Community details"><ArrowUpRight size={15}/></button>
    </div>
    <div className="so-india-content">
      <div className="so-india-map" aria-label="Interactive map of India's states and union territories" onClick={selectMapState} dangerouslySetInnerHTML={{ __html: mapSvg }}/>
      <div className="so-india-state-panel">
        <div className="so-india-state-summary"><strong>{selectedState}</strong><span>{stateList.length} states &amp; union territories</span></div>
        <div className="so-india-state-list" aria-label="Choose a state">
          {stateList.map(state => <button key={state.slug} type="button" className={selectedState === state.name ? 'active' : ''} aria-pressed={selectedState === state.name} onClick={() => setSelectedState(state.name)}>{state.name}</button>)}
        </div>
      </div>
    </div>
    <a className="so-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
  </article>;
}
