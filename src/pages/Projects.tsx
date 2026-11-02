import { EmptyState, PersonAvatar } from '../components/bits';
import { dayDiff } from '../lib/format';
import { useStore } from '../lib/store';
import { useUI } from '../lib/ui';

const cls = (s: string) => (s === 'Live' ? 'won' : s === 'Handover' ? 'late' : s === 'Kickoff' ? '' : 'mid');

export default function Projects() {
  const store = useStore();
  const ui = useUI();
  const list = [...store.projects].sort((a, b) => (a.stage === 'Live' ? 1 : 0) - (b.stage === 'Live' ? 1 : 0) || (a.due_date || '9').localeCompare(b.due_date || '9'));
  const active = list.filter(p => p.stage !== 'Live').length;
  if (!list.length) return <><div className="ph"><h1>Projects</h1></div><EmptyState title="No projects yet" text="Mark a deal as won and start its delivery project from there." /></>;
  return <>
    <div className="ph"><h1>Projects</h1><span className="meta">{active} in progress</span></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Project</th><th>Type</th><th>Stage</th><th>Owner</th><th>Due</th><th>Progress</th></tr></thead>
      <tbody>{list.map(p => {
        const tasks = store.project_tasks.filter(t => t.project_id === p.id);
        const done = tasks.filter(t => t.done).length, pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
        const n = p.due_date ? dayDiff(p.due_date + 'T12:00:00') : null;
        return <tr key={p.id} data-proj tabIndex={0} onClick={() => ui.openDrawer({ kind: 'project', id: p.id })} onKeyDown={e => { if (e.key === 'Enter') ui.openDrawer({ kind: 'project', id: p.id }); }}>
          <td><strong>{p.name}</strong><span className="sub2">{p.client_name}</span></td>
          <td>{store.pipelines.find(x => x.id === p.pipeline_id)?.short_name || ''}</td>
          <td><span className={'st ' + cls(p.stage)}><i />{p.stage}</span></td>
          <td><PersonAvatar p={store.profileById(p.owner_id)} /></td>
          <td>{p.stage === 'Live' ? <span className="muted">Delivered</span> : n === null ? '' : n < 0 ? <span className="due late">{-n}d late</span> : n === 0 ? 'Today' : 'In ' + n + ' days'}</td>
          <td><div className="prog"><div className={'bar' + (pct === 100 ? ' done' : '')}><i style={{ width: pct + '%' }} /></div>{done}/{tasks.length}</div></td>
        </tr>;
      })}</tbody>
    </table></div>
  </>;
}
