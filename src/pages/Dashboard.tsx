import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/bits';
import { NewContactModal } from '../components/Modals';
import { dayDiff, money, short } from '../lib/format';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';

const niceMax = (m: number) => { const p = Math.pow(10, Math.floor(Math.log10(m))); const n = m / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

export default function Dashboard() {
  const store = useStore();
  const ui = useUI();
  const navigate = useNavigate();
  const [pf, setPf] = useState('all');
  if (!store.deals.length) {
    return <><div className="ph"><h1>Dashboard</h1></div>
      <EmptyState title="No deals yet" text="Add your first contact, or import your spreadsheet from Contacts.">
        <button className="btn primary sm" onClick={() => ui.openModal(<NewContactModal />)}>New contact</button>
        <button className="btn sm" onClick={() => navigate('/contacts?import=1')}>Import CSV</button>
      </EmptyState></>;
  }
  const kind = (sid: string) => store.stageById(sid)?.kind;
  const deals = store.deals.filter(d => pf === 'all' || d.pipeline_id === pf);
  const open = deals.filter(d => kind(d.stage_id) === 'open');
  const closed = deals.filter(d => kind(d.stage_id) !== 'open' && d.closed_at);
  const ago = (d: { closed_at: string | null }) => -dayDiff(d.closed_at!);
  const won = closed.filter(d => kind(d.stage_id) === 'won');
  const sum = (a: { value: number }[]) => a.reduce((s, x) => s + x.value, 0);
  const w30 = won.filter(d => ago(d) <= 30), wPrev = won.filter(d => ago(d) > 30 && ago(d) <= 60);
  const c30 = closed.filter(d => ago(d) <= 30);
  const rate = c30.length ? Math.round((c30.filter(d => kind(d.stage_id) === 'won').length / c30.length) * 100) : 0;
  const delta = sum(wPrev) ? Math.round(((sum(w30) - sum(wPrev)) / sum(wPrev)) * 100) : null;

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const k = 7 - i, list = won.filter(d => Math.floor(ago(d) / 7) === k);
    const start = new Date(); start.setDate(start.getDate() - (k * 7 + 6));
    return { k, v: sum(list), n: list.length, label: k === 0 ? 'This week' : start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
  });
  const top = niceMax(Math.max(...weeks.map(w => w.v), 1000));
  const W = 640, H = 210, L = 44, B = 24, T = 18, bw = (W - L) / 8, ph = H - B - T;
  const pipes = pf === 'all' ? store.pipelines : store.pipelines.filter(p => p.id === pf);

  return <>
    <div className="ph"><h1>Dashboard</h1><span className="meta">Last 30 days</span>
      <div className="acts"><div className="seg" role="group" aria-label="Pipeline">
        <button aria-pressed={pf === 'all'} onClick={() => setPf('all')}>All</button>
        {store.pipelines.map(p => <button key={p.id} aria-pressed={pf === p.id} onClick={() => setPf(p.id)}>{p.short_name || p.name}</button>)}
      </div></div></div>
    <dl className="kpis">
      <div><dt>Won</dt><dd>{money(sum(w30))}{delta !== null && <small className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '+' : ''}{delta}%</small>}</dd></div>
      <div><dt>Open pipeline</dt><dd>{money(sum(open))}<small className="muted">{open.length} deals</small></dd></div>
      <div><dt>Close rate</dt><dd>{rate}%</dd></div>
    </dl>
    <div className="dash">
      <section className="chart span2"><div className="chart-h"><h2>Revenue won by week</h2><span>{money(weeks.reduce((a, w) => a + w.v, 0))} over 8 weeks</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue won by week">
          {[0, top / 2, top].map(v => { const y = H - B - (v / top) * ph; return <g key={v}><line className="gl" x1={L} x2={W} y1={y} y2={y} /><text className="ax" x={L - 8} y={y + 4} textAnchor="end">{short(v)}</text></g>; })}
          {weeks.map((w, i) => {
            const h = (w.v / top) * ph, x = L + i * bw + bw * 0.2, y = H - B - h, cx = L + i * bw + bw / 2;
            return <g key={w.k}><title>{`${w.label}: ${money(w.v)}, ${w.n} ${w.n === 1 ? 'deal' : 'deals'}`}</title>
              <rect className={'b' + (w.k === 0 ? ' now' : '')} x={x} y={y} width={bw * 0.6} height={Math.max(h, 0)} rx={3} />
              {w.v > 0 && <text className="bl" x={cx} y={y - 6} textAnchor="middle">{short(w.v)}</text>}
              <text className="ax" x={cx} y={H - 6} textAnchor="middle">{w.label}</text></g>;
          })}
        </svg></section>
      <section className="chart"><div className="chart-h"><h2>Open deals by stage</h2><span>{open.length} deals</span></div>
        {pipes.map(p => {
          const st = store.pipelineStages(p.id).filter(s => s.kind === 'open');
          const rows = st.map(s => { const ds = open.filter(d => d.stage_id === s.id); return { s, n: ds.length, v: sum(ds) }; });
          const tv = rows.reduce((a, r) => a + r.v, 0), m = rows.length;
          const shade = (i: number) => `color-mix(in srgb,var(--accent) ${Math.round(22 + 78 * (m > 1 ? i / (m - 1) : 1))}%,var(--surface))`;
          return <div className="stg" key={p.id}>
            <div className="stg-h"><span>{p.short_name || p.name}</span><strong>{money(tv)}</strong></div>
            <div className="stg-bar" role="img" aria-label="Open value by stage">{rows.map((r, i) => r.v > 0 && <i key={r.s.id} style={{ flex: r.v, background: shade(i) }} title={`${r.s.name}: ${money(r.v)}`} />)}</div>
            <ul className="stg-list">{rows.map((r, i) => <li key={r.s.id}>
              <button type="button" className={r.n ? undefined : 'zero'} onClick={() => { ui.resetFilters(); ui.setPipe(p.id); ui.setPview('list'); navigate('/pipeline'); }}>
                <i style={{ background: shade(i) }} /><span>{r.s.name}</span><span className="c">{r.n}</span><span className="v">{short(r.v)}</span></button></li>)}</ul>
          </div>;
        })}</section>
    </div>
  </>;
}
