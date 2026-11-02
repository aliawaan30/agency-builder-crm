import Papa from 'papaparse';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { activeFilterCount, FilterBar, useFilter } from '../components/Filters';
import { EmptyState, Icon, PersonAvatar, StageLabel, Tag } from '../components/bits';
import { ImportModal } from '../components/Import';
import { NewContactModal } from '../components/Modals';
import { dayDiff, fmtDue, money, theirTime } from '../lib/format';
import { useStore } from '../lib/store';
import type { Contact, Deal } from '../lib/types';
import { useUI } from '../lib/ui';

type Row = { c: Contact; d?: Deal };
type SortKey = 'name' | 'business' | 'stage' | 'owner' | 'next' | 'value';

export default function Contacts() {
  const store = useStore();
  const ui = useUI();
  const pass = useFilter();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  useEffect(() => { if (params.get('import')) { ui.openModal(<ImportModal />); setParams({}, { replace: true }); } }, [params, setParams, ui]);

  if (!store.contacts.length) {
    return <><div className="ph"><h1>Contacts</h1><span className="meta">0</span></div>
      <EmptyState title="No contacts yet" text="Add contacts one by one, or import the sales spreadsheet as a CSV.">
        <button className="btn primary sm" onClick={() => ui.openModal(<NewContactModal />)}>New contact</button>
        <button className="btn sm" onClick={() => ui.openModal(<ImportModal />)}>Import CSV</button>
      </EmptyState></>;
  }

  const f = ui.filters;
  const q = ui.q.trim().toLowerCase();
  const isOpen = (d?: Deal) => !!d && store.stageById(d.stage_id)?.kind === 'open';
  // Each contact shows its most relevant deal: the first open one, else the latest.
  const mainDeal = (c: Contact) => {
    const ds = store.dealsOf(c.id).filter(d => f.pipeline === 'all' || d.pipeline_id === f.pipeline);
    return ds.find(d => isOpen(d)) || ds.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  };
  let rows: Row[] = store.contacts.map(c => ({ c, d: mainDeal(c) }));
  if (f.pipeline !== 'all') rows = rows.filter(r => r.d);
  if (f.stage !== 'all') rows = rows.filter(r => r.d?.stage_id === f.stage);
  rows = rows.filter(r => (r.d ? pass(r.d, r.c) : activeFilterCount(f, false) === 0));
  if (q) rows = rows.filter(({ c }) => [c.full_name, c.company, c.city, c.email || '', c.phone, ...c.tags].join(' ').toLowerCase().includes(q));
  const stageIdx = (d?: Deal) => (d ? store.stages.findIndex(s => s.id === d.stage_id) : 999);
  const cmp = (x: number | string, y: number | string) => (x === y ? 0 : x < y ? -1 : 1);
  const S: Record<SortKey, (a: Row, b: Row) => number> = {
    name: (a, b) => a.c.full_name.localeCompare(b.c.full_name),
    business: (a, b) => (a.c.company || 'zzz').localeCompare(b.c.company || 'zzz'),
    stage: (a, b) => cmp(stageIdx(a.d), stageIdx(b.d)),
    owner: (a, b) => (store.profileById(a.d?.owner_id || null)?.full_name || 'zzz').localeCompare(store.profileById(b.d?.owner_id || null)?.full_name || 'zzz'),
    next: (a, b) => cmp(a.d?.next_step_at && isOpen(a.d) ? a.d.next_step_at : 'z', b.d?.next_step_at && isOpen(b.d) ? b.d.next_step_at : 'z'),
    value: (a, b) => cmp(a.d?.value || 0, b.d?.value || 0)
  };
  rows.sort((a, b) => S[sort.key](a, b) * sort.dir);
  const fil = activeFilterCount(f, true);

  const th = (key: SortKey, label: string, cls?: string) => {
    const on = sort.key === key;
    return <th className={cls} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setSort(on ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: key === 'value' ? -1 : 1 })}>
        {label}{on && <Icon name={sort.dir > 0 ? 'sortUp' : 'sortDown'} size={12} />}</button></th>;
  };

  function exportCsv() {
    const data = rows.map(({ c, d }) => ({
      name: c.full_name, business: c.company, email: c.email || '', phone: c.phone, city: c.city, timezone: c.timezone, source: c.source,
      tags: c.tags.join(', '), pipeline: d ? store.pipelines.find(p => p.id === d.pipeline_id)?.name : '',
      stage: d ? store.stageById(d.stage_id)?.name : '', value: d?.value ?? '', owner: store.profileById(d?.owner_id || null)?.full_name || '',
      next_step: d?.next_step || '', next_step_at: d?.next_step_at || ''
    }));
    const blob = new Blob([Papa.unparse(data)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return <>
    <div className="ph"><h1>Contacts</h1><span className="meta">{fil || q ? `${rows.length} of ${store.contacts.length}` : store.contacts.length}</span>
      {q && <><span className="meta">matching “{ui.q}”</span><button className="linkbtn" onClick={() => ui.setQ('')}>Clear search</button></>}
      <div className="acts">
        <button className="btn sm" onClick={() => ui.openModal(<ImportModal />)}><Icon name="upload" size={13} />Import</button>
        {store.isAdmin && <button className="btn sm" onClick={exportCsv}><Icon name="download" size={13} />Export</button>}
      </div></div>
    <FilterBar withContacts />
    <div className="table-wrap"><table>
      <thead><tr>{th('name', 'Name')}{th('business', 'Business')}<th>Their time</th>{th('stage', 'Stage')}{th('owner', 'Owner')}{th('next', 'Next step')}{th('value', 'Value', 'num')}</tr></thead>
      <tbody>
        {rows.map(({ c, d }) => {
          const t = theirTime(c.timezone), n = d?.next_step_at ? dayDiff(d.next_step_at) : null;
          const extra = store.dealsOf(c.id).length - 1;
          return <tr key={c.id} data-open tabIndex={0} onClick={() => ui.openDrawer({ kind: 'contact', id: c.id })} onKeyDown={e => { if (e.key === 'Enter') ui.openDrawer({ kind: 'contact', id: c.id }); }}>
            <td><strong>{c.full_name}</strong>{c.tags.length ? <span className="tags">{c.tags.map(x => <Tag key={x} t={x} />)}</span> : <span className="sub2">{c.email}</span>}</td>
            <td>{c.company || 'Agency lead'}<span className="sub2">{c.city}</span></td>
            <td>{t.time && <span className="tz-cell" title={t.label}><span className={'dot' + (t.ok ? ' ok' : '')} />{t.time}</span>}</td>
            <td>{d ? <><StageLabel stage={store.stageById(d.stage_id)} all={store.stages} /><span className="sub2">{store.pipelines.find(p => p.id === d.pipeline_id)?.short_name}{extra > 0 ? ` + ${extra} more` : ''}</span></> : <span className="muted">No deal</span>}</td>
            <td>{d && <PersonAvatar p={store.profileById(d.owner_id)} />}</td>
            <td>{d && isOpen(d) ? <>{d.next_step || 'None'}<span className={'sub2 due' + (n !== null && n < 0 ? ' late' : '')}>{fmtDue(d.next_step_at)}</span></> : <span className="muted">{d ? 'Closed' : ''}</span>}</td>
            <td className="num">{d ? money(d.value) : ''}</td>
          </tr>;
        })}
        {!rows.length && <tr><td colSpan={7} className="empty">No contacts match these filters.</td></tr>}
      </tbody>
    </table></div>
  </>;
}
