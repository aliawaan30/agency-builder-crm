import { useEffect, useState } from 'react';
import { activeFilterCount, FilterBar, useFilter } from '../components/Filters';
import { EmptyState, Icon, PersonAvatar, StageLabel, Tag, stageClass } from '../components/bits';
import { NewContactModal } from '../components/Modals';
import { useActions } from '../lib/actions';
import { dayDiff, fmtDue, money, short, theirTime } from '../lib/format';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';

export default function Pipeline() {
  const store = useStore();
  const ui = useUI();
  const pass = useFilter();
  const { moveDeal } = useActions();
  const [over, setOver] = useState('');
  const pipe = store.pipelines.find(p => p.id === ui.pipe) || store.pipelines[0];
  useEffect(() => { if (pipe && pipe.id !== ui.pipe) ui.setPipe(pipe.id); }, [pipe, ui]);

  if (!pipe) return <><div className="ph"><h1>Pipeline</h1></div><EmptyState title="No pipelines" text="Create one from Edit stages." /></>;
  if (!store.deals.length) {
    return <><div className="ph"><h1>Pipeline</h1></div>
      <EmptyState title="Your pipeline is empty" text="Add a contact and their deal shows up here.">
        <button className="btn primary sm" onClick={() => ui.openModal(<NewContactModal />)}>New contact</button></EmptyState></>;
  }
  const stages = store.pipelineStages(pipe.id);
  const all = store.deals.filter(d => d.pipeline_id === pipe.id);
  const list = all.filter(d => pass(d, store.contactById(d.contact_id)));
  const isOpen = (sid: string) => store.stageById(sid)?.kind === 'open';
  const open = list.filter(d => isOpen(d.stage_id));
  const fil = activeFilterCount(ui.filters, false);
  const dueKey = (d: typeof list[number]) => (d.next_step_at && isOpen(d.stage_id) ? +new Date(d.next_step_at) : 9e15);

  return <>
    <div className="ph"><h1>Pipeline</h1>
      <span className="meta">{fil ? `${list.length} of ${all.length} deals` : `${open.length} open, ${money(open.reduce((a, d) => a + d.value, 0))}`}</span>
      <div className="acts">
        <div className="seg" role="group" aria-label="Pipeline">{store.pipelines.map(p => <button key={p.id} aria-pressed={p.id === pipe.id} onClick={() => ui.setPipe(p.id)}>{p.short_name || p.name}</button>)}</div>
        <div className="seg" role="group" aria-label="Layout">
          <button aria-pressed={ui.pview === 'board'} onClick={() => ui.setPview('board')}>Board</button>
          <button aria-pressed={ui.pview === 'list'} onClick={() => ui.setPview('list')}>List</button>
        </div>
        <button className="btn sm" onClick={() => ui.openDrawer({ kind: 'stages', id: pipe.id })}>{store.isLead ? 'Edit stages' : 'Stages'}</button>
      </div></div>
    <FilterBar />

    {ui.pview === 'board' ? (
      <div className="board-wrap"><div className="board">
        {stages.map(s => {
          const ds = list.filter(d => d.stage_id === s.id).sort((a, b) => dueKey(a) - dueKey(b));
          const total = ds.reduce((a, d) => a + d.value, 0);
          return <section className="col" key={s.id}>
            <header><StageLabel stage={s} all={store.stages} /><span className="col-count">{ds.length}</span><span className="col-sum">{ds.length ? short(total) : ''}</span></header>
            <div className={'col-body' + (over === s.id ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== s.id) setOver(s.id); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(''); }}
              onDrop={e => { e.preventDefault(); setOver(''); const d = store.deals.find(x => x.id === e.dataTransfer.getData('text/plain')); if (d) moveDeal(d, s.id); }}>
              {ds.map(d => {
                const c = store.contactById(d.contact_id);
                if (!c) return null;
                const n = d.next_step_at ? dayDiff(d.next_step_at) : null;
                const can = store.canEditDeal(d);
                return <article key={d.id} className="card" draggable={can} tabIndex={0} aria-label={c.full_name}
                  onDragStart={e => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); }}
                  onDragEnd={e => e.currentTarget.classList.remove('dragging')}
                  onClick={() => ui.openDrawer({ kind: 'contact', id: c.id })}
                  onKeyDown={e => { if (e.key === 'Enter') ui.openDrawer({ kind: 'contact', id: c.id }); }}
                  style={can ? undefined : { cursor: 'pointer' }}>
                  <div className="card-top"><strong>{c.full_name}</strong><PersonAvatar p={store.profileById(d.owner_id)} /></div>
                  <div className="card-co">{c.company || 'Agency lead' + (c.city ? ', ' + c.city.split(',')[0] : '')}</div>
                  {c.tags.length > 0 && <div className="tags">{c.tags.slice(0, 2).map(t => <Tag key={t} t={t} />)}{c.tags.length > 2 && <span className="tag" style={{ ['--h' as any]: '#74746D' }}>+{c.tags.length - 2}</span>}</div>}
                  <div className="card-foot"><span className="val">{money(d.value)}</span>{isOpen(d.stage_id) && <span className={'due' + (n !== null && n < 0 ? ' late' : '')}>{fmtDue(d.next_step_at)}</span>}</div>
                </article>;
              })}
              {!ds.length && <p className="col-empty">No deals</p>}
            </div>
          </section>;
        })}
      </div></div>
    ) : (() => {
      const groups = stages.map(s => ({ s, ds: list.filter(d => d.stage_id === s.id).sort((a, b) => dueKey(a) - dueKey(b)) })).filter(g => g.ds.length);
      if (!groups.length) return <div className="list empty">No deals match these filters.</div>;
      return <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Business</th><th>Owner</th><th>Next step</th><th>Their time</th><th className="num">Value</th></tr></thead>
        {groups.map(g => <tbody key={g.s.id}>
          <tr className="grow"><td colSpan={6}><span className={'st ' + stageClass(g.s, store.stages)}><i />{g.s.name}</span><span className="muted">{g.ds.length}</span><span className="gsum">{money(g.ds.reduce((a, d) => a + d.value, 0))}</span></td></tr>
          {g.ds.map(d => {
            const c = store.contactById(d.contact_id);
            if (!c) return null;
            const t = theirTime(c.timezone), n = d.next_step_at ? dayDiff(d.next_step_at) : null;
            return <tr key={d.id} tabIndex={0} data-open onClick={() => ui.openDrawer({ kind: 'contact', id: c.id })} onKeyDown={e => { if (e.key === 'Enter') ui.openDrawer({ kind: 'contact', id: c.id }); }}>
              <td><strong>{c.full_name}</strong>{c.tags.length > 0 && <span className="tags">{c.tags.map(x => <Tag key={x} t={x} />)}</span>}</td>
              <td>{c.company || 'Agency lead'}<span className="sub2">{c.city}</span></td>
              <td><PersonAvatar p={store.profileById(d.owner_id)} /></td>
              <td>{isOpen(d.stage_id) ? <>{d.next_step || 'None'}<span className={'sub2 due' + (n !== null && n < 0 ? ' late' : '')}>{fmtDue(d.next_step_at)}</span></> : <span className="muted">Closed</span>}</td>
              <td><span className="tz-cell" title={t.label}><span className={'dot' + (t.ok ? ' ok' : '')} />{t.time}</span></td>
              <td className="num">{money(d.value)}</td>
            </tr>;
          })}
        </tbody>)}
      </table></div>;
    })()}
    {!store.isLead && <p className="muted small" style={{ marginTop: 10 }}><Icon name="team" size={12} /> You can move your own deals. Ask a manager to move someone else’s.</p>}
  </>;
}
