import { dayDiff } from '../lib/format';
import { useStore } from '../lib/store';
import type { Contact, Deal } from '../lib/types';
import { SOURCES } from '../lib/types';
import { FILTER_DEFAULTS, useUI, type Filters } from '../lib/ui';

export function useFilter() {
  const { filters: f } = useUI();
  const { stageById } = useStore();
  return (d: Deal, c: Contact | undefined) => {
    if (!c) return false;
    const open = stageById(d.stage_id)?.kind === 'open';
    if (f.owner !== 'all' && d.owner_id !== f.owner) return false;
    if (f.source !== 'all' && c.source !== f.source) return false;
    if (f.tag !== 'all' && !c.tags.includes(f.tag)) return false;
    if (f.cold && !(open && dayDiff(d.last_activity_at) <= -5)) return false;
    const n = d.next_step_at ? dayDiff(d.next_step_at) : null;
    if (f.due === 'overdue') return open && n !== null && n < 0;
    if (f.due === 'today') return open && n === 0;
    if (f.due === 'week') return open && n !== null && n >= 0 && n <= 6;
    if (f.due === 'none') return open && !d.next_step_at;
    return true;
  };
}

export function activeFilterCount(f: Filters, withContacts: boolean) {
  const base = [f.owner !== 'all', f.due !== 'any', f.source !== 'all', f.tag !== 'all', f.cold];
  if (withContacts) base.push(f.pipeline !== 'all', f.stage !== 'all');
  return base.filter(Boolean).length;
}

const DUE: [Filters['due'], string][] = [['any', 'Due date'], ['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Due in 7 days'], ['none', 'No next step']];

export function FilterBar({ withContacts }: { withContacts?: boolean }) {
  const { filters: f, setFilters, resetFilters } = useUI();
  const { profiles, contacts, pipelines, pipelineStages } = useStore();
  const tags = [...new Set(contacts.flatMap(c => c.tags))].sort((a, b) => a.localeCompare(b));
  const on = (b: boolean) => (b ? 'on' : undefined);
  const reset = () => resetFilters(withContacts ? {} : { pipeline: f.pipeline, stage: f.stage });
  return (
    <div className="filters" role="group" aria-label="Filters">
      {withContacts && <>
        <select className={on(f.pipeline !== 'all')} aria-label="Pipeline" value={f.pipeline} onChange={e => setFilters({ pipeline: e.target.value, stage: 'all' })}>
          <option value="all">Pipeline</option>
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {f.pipeline !== 'all' && (
          <select className={on(f.stage !== 'all')} aria-label="Stage" value={f.stage} onChange={e => setFilters({ stage: e.target.value })}>
            <option value="all">Stage</option>
            {pipelineStages(f.pipeline).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </>}
      <select className={on(f.owner !== 'all')} aria-label="Owner" value={f.owner} onChange={e => setFilters({ owner: e.target.value })}>
        <option value="all">Owner</option>
        {profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <select className={on(f.due !== 'any')} aria-label="Due date" value={f.due} onChange={e => setFilters({ due: e.target.value as Filters['due'] })}>
        {DUE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select className={on(f.source !== 'all')} aria-label="Source" value={f.source} onChange={e => setFilters({ source: e.target.value })}>
        <option value="all">Source</option>
        {SOURCES.map(s => <option key={s}>{s}</option>)}
      </select>
      <select className={on(f.tag !== 'all')} aria-label="Tag" value={f.tag} onChange={e => setFilters({ tag: e.target.value })}>
        <option value="all">Tag</option>
        {tags.map(t => <option key={t}>{t}</option>)}
      </select>
      <button type="button" className="fchip" aria-pressed={f.cold} title="Open deals with no contact in 5 days or more" onClick={() => setFilters({ cold: !f.cold })}>Going cold</button>
      {activeFilterCount(f, !!withContacts) > 0 && <button type="button" className="linkbtn" onClick={reset}>Clear</button>}
    </div>
  );
}

export const SAVED_VIEWS: { id: string; label: string; path: string; set: Partial<Filters>; color: string }[] = [
  { id: 'hot', label: 'Hot deals', path: '/pipeline', set: { tag: 'Hot' }, color: '#B4433A' },
  { id: 'cold', label: 'Going cold', path: '/pipeline', set: { cold: true }, color: '#0F7C86' },
  { id: 'nostep', label: 'No next step', path: '/contacts', set: { due: 'none' }, color: '#B7791F' },
  { id: 'overdue', label: 'Overdue', path: '/contacts', set: { due: 'overdue' }, color: '#7A3FB8' }
];
export const viewMatches = (v: (typeof SAVED_VIEWS)[number], path: string, f: Filters) =>
  v.path === path && (Object.keys(FILTER_DEFAULTS) as (keyof Filters)[]).every(k => f[k] === (k in v.set ? v.set[k] : FILTER_DEFAULTS[k]));
