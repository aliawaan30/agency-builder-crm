import { useCallback, useEffect, useState } from 'react';
import { useActions } from '../lib/actions';
import { cleanText, dayDiff, fmtAgo, fmtDate, fmtDue, firstName, fromLocalInput, guessTimezone, isEmail, theirTime, TIMEZONES, toLocalInput } from '../lib/format';
import { useStore } from '../lib/store';
import { friendlyError, supabase } from '../lib/supabase';
import { PROJECT_STAGES, SOURCES, type Activity, type Contact, type Deal, type Stage } from '../lib/types';
import { useUI } from '../lib/ui';
import { Avatar, Icon, Modal, Tag } from './bits';
import { AddDealModal, ConfirmModal, LogCallModal } from './Modals';

export function Drawer() {
  const { drawer, closeDrawer } = useUI();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-wrap')) closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDrawer]);
  return (
    <>
      {drawer && <div className="scrim" onClick={closeDrawer} />}
      <aside className={'drawer' + (drawer ? ' open' : '')} aria-hidden={!drawer}>
        {drawer?.kind === 'contact' && <ContactDrawer id={drawer.id} key={drawer.id} />}
        {drawer?.kind === 'project' && <ProjectDrawer id={drawer.id} key={drawer.id} />}
        {drawer?.kind === 'stages' && <StagesDrawer id={drawer.id} />}
      </aside>
    </>
  );
}

function Head({ title, sub, avatar }: { title: string; sub?: string; avatar?: string }) {
  const { closeDrawer } = useUI();
  return (
    <header className="dr-head">
      {avatar && <Avatar name={avatar} large />}
      <div className="dr-title"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      <button className="icon-btn" onClick={closeDrawer} aria-label="Close" autoFocus><Icon name="x" size={16} /></button>
    </header>
  );
}

const ACT_ICON: Record<string, string> = { call: 'phone', email: 'mail', note: 'note', stage: 'stage', created: 'created', import: 'import' };
const ACT_LABEL: Record<string, string> = { call: 'Call', email: 'Email', note: 'Note', stage: 'Stage', created: 'Created', import: 'Imported' };

function ContactDrawer({ id }: { id: string }) {
  const store = useStore();
  const ui = useUI();
  const { logActivity } = useActions();
  const c = store.contactById(id);
  const [acts, setActs] = useState<Activity[]>([]);
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');

  const loadActs = useCallback(async () => {
    const { data } = await supabase.from('activities').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(200);
    setActs(data || []);
  }, [id]);
  useEffect(() => { loadActs(); }, [loadActs]);

  if (!c) return <div className="loading">This contact was deleted.</div>;
  const deals = store.dealsOf(c.id);
  const openDeal = deals.find(d => store.stageById(d.stage_id)?.kind === 'open') || deals[0];
  const canEdit = store.canEditContact(c);
  const t = theirTime(c.timezone);
  const allTags = [...new Set(store.contacts.flatMap(x => x.tags))];

  async function save(patch: Partial<Contact>) {
    const { data, error } = await supabase.from('contacts').update(patch).eq('id', c!.id).select().single();
    if (error) { ui.toast(friendlyError(error.message)); return; }
    store.put('contacts', data);
    ui.toast('Saved');
  }
  const field = (k: keyof Contact, v: string) => { if ((c as any)[k] !== v) save({ [k]: v } as Partial<Contact>); };

  async function addTag() {
    let n = cleanText(tag, 24);
    setTag('');
    if (!n) return;
    n = allTags.find(x => x.toLowerCase() === n.toLowerCase()) || n;
    if (c!.tags.some(x => x.toLowerCase() === n.toLowerCase())) return;
    await save({ tags: [...c!.tags, n] });
  }
  async function addNote() {
    if (!note.trim()) return;
    if (await logActivity(c!.id, openDeal?.id || null, 'note', note.trim())) { setNote(''); loadActs(); ui.toast('Note saved'); }
  }
  const del = () => ui.openModal(<ConfirmModal title="Delete contact" submit="Delete" text={`This removes ${c.full_name}, their deals and all activity. You can’t undo this.`}
    onConfirm={async () => {
      const { error } = await supabase.from('contacts').delete().eq('id', c.id);
      if (error) return ui.toast(friendlyError(error.message));
      deals.forEach(d => store.drop('deals', d.id));
      store.drop('contacts', c.id);
      ui.closeDrawer();
      ui.toast('Contact deleted');
    }} />);

  return (
    <div key={c.updated_at}>
      <Head title={c.full_name} sub={[c.company || 'Agency lead', c.city].filter(Boolean).join(', ')} avatar={c.full_name} />
      <div className="dr-actions">
        <button className="btn sm primary" disabled={!openDeal} onClick={() => openDeal && ui.openModal(<LogCallModal deal={openDeal} />)}>Log call</button>
        {c.phone && <a className="btn sm" href={'tel:' + c.phone.replace(/[^\d+]/g, '')}><Icon name="phone" size={13} />Call</a>}
        {c.email && <a className="btn sm" href={'mailto:' + c.email}><Icon name="mail" size={13} />Email</a>}
        <button className="btn sm" onClick={() => { ui.closeDrawer(); ui.askAbout(`What’s the latest with ${c.full_name}, and what should we do next?`); }}><Icon name="ask" size={13} />Ask about {firstName(c.full_name)}</button>
      </div>
      {t.time && <p className="tz-line"><span className={'dot' + (t.ok ? ' ok' : '')} />{t.time} for {firstName(c.full_name)}. {t.label}.</p>}

      <div className="tag-edit">
        {c.tags.length > 0 && <div className="tags">{c.tags.map(x => <Tag key={x} t={x} onRemove={canEdit ? () => save({ tags: c.tags.filter(y => y !== x) }) : undefined} />)}</div>}
        {canEdit && <form className="tag-form" onSubmit={e => { e.preventDefault(); addTag(); }}>
          <input list="tag-list" value={tag} onChange={e => setTag(e.target.value)} placeholder="Add a tag" aria-label="Add a tag" autoComplete="off" />
          <datalist id="tag-list">{allTags.filter(x => !c.tags.includes(x)).map(x => <option key={x} value={x} />)}</datalist>
        </form>}
      </div>

      <section className="sec">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Deals
          <button className="btn sm" onClick={() => ui.openModal(<AddDealModal contactId={c.id} />)}><Icon name="plus" size={13} />Add deal</button></h3>
        {deals.length === 0 && <p className="ro">No deals yet.</p>}
        {deals.map(d => <DealCard key={d.id + d.stage_id + d.value + d.next_step + (d.next_step_at || '') + d.owner_id} deal={d} />)}
      </section>

      <dl className="fields" style={{ marginTop: 18 }}>
        <div className="wide"><dt>Name</dt><dd><input defaultValue={c.full_name} disabled={!canEdit} onBlur={e => e.target.value.trim() && field('full_name', cleanText(e.target.value, 120))} /></dd></div>
        <div className="wide"><dt>Business</dt><dd><input defaultValue={c.company} disabled={!canEdit} placeholder="Empty for agency leads" onBlur={e => field('company', cleanText(e.target.value, 120))} /></dd></div>
        <div><dt>Email</dt><dd><input defaultValue={c.email || ''} disabled={!canEdit} onBlur={e => {
          const v = e.target.value.trim().toLowerCase();
          if (v && !isEmail(v)) { ui.toast('Check the email address'); e.target.value = c.email || ''; return; }
          if (v !== (c.email || '')) save({ email: v || null });
        }} /></dd></div>
        <div><dt>Phone</dt><dd><input defaultValue={c.phone} disabled={!canEdit} onBlur={e => field('phone', e.target.value.trim())} /></dd></div>
        <div><dt>City</dt><dd><input defaultValue={c.city} disabled={!canEdit} onBlur={e => {
          const v = cleanText(e.target.value, 80);
          if (v !== c.city) save({ city: v, timezone: guessTimezone(v, c.timezone) });
        }} /></dd></div>
        <div><dt>Time zone</dt><dd><select value={c.timezone} disabled={!canEdit} onChange={e => save({ timezone: e.target.value })}>
          {!TIMEZONES.some(([v]) => v === c.timezone) && <option value={c.timezone}>{c.timezone}</option>}
          {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></dd></div>
        <div><dt>Contact owner</dt><dd><select value={c.owner_id || ''} disabled={!canEdit} onChange={e => save({ owner_id: e.target.value || null })}>
          <option value="">Unassigned</option>
          {store.profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select></dd></div>
        <div><dt>Source</dt><dd><select value={c.source} disabled={!canEdit} onChange={e => save({ source: e.target.value })}>
          {!SOURCES.includes(c.source) && <option>{c.source}</option>}
          {SOURCES.map(s => <option key={s}>{s}</option>)}
        </select></dd></div>
        <div><dt>Added</dt><dd>{fmtDate(c.created_at)}</dd></div>
      </dl>
      {!canEdit && <p className="ro">Only the owner or a manager can edit this contact. You can still log calls and notes.</p>}

      <section className="sec">
        <h3>Activity</h3>
        <form className="note-form" onSubmit={e => { e.preventDefault(); addNote(); }}>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note" aria-label="Note" />
          <button className="btn sm">Save note</button>
        </form>
        <ol className="tl">
          {acts.map(a => (
            <li key={a.id}><span className="t-ico"><Icon name={ACT_ICON[a.type]} size={12} /></span>
              <div><div className="t-meta">{ACT_LABEL[a.type]}, {store.profileById(a.created_by)?.full_name || 'Someone'}, {fmtAgo(a.created_at)}</div><p className="t-text">{a.body}</p></div></li>
          ))}
        </ol>
      </section>
      {store.isLead && <button className="btn sm danger" style={{ marginTop: 18 }} onClick={del}>Delete contact</button>}
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const store = useStore();
  const ui = useUI();
  const { updateDeal, moveDeal } = useActions();
  const canEdit = store.canEditDeal(deal);
  const pipe = store.pipelines.find(p => p.id === deal.pipeline_id);
  const stages = store.pipelineStages(deal.pipeline_id);
  const open = store.stageById(deal.stage_id)?.kind === 'open';
  const n = deal.next_step_at ? dayDiff(deal.next_step_at) : null;
  return (
    <div className="deal">
      <div className="deal-h"><strong>{pipe?.name}</strong>
        {open && <button className="btn sm" onClick={() => ui.openModal(<LogCallModal deal={deal} />)}>Log call</button>}</div>
      <dl className="fields">
        <div><dt>Stage</dt><dd><select value={deal.stage_id} disabled={!canEdit} onChange={e => moveDeal(deal, e.target.value)}>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></dd></div>
        <div><dt>Value (USD)</dt><dd><input inputMode="numeric" defaultValue={deal.value} disabled={!canEdit} onBlur={e => {
          const v = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
          if (v !== deal.value) updateDeal(deal, { value: v });
        }} /></dd></div>
        <div><dt>Deal owner</dt><dd><select value={deal.owner_id || ''} disabled={!canEdit} onChange={e => updateDeal(deal, { owner_id: e.target.value || null })}>
          <option value="">Unassigned</option>
          {store.profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select></dd></div>
        <div><dt>Next step date</dt><dd><input type="datetime-local" defaultValue={toLocalInput(deal.next_step_at)} disabled={!canEdit || !open}
          onBlur={e => { const v = fromLocalInput(e.target.value); if (v !== deal.next_step_at) updateDeal(deal, { next_step_at: v }); }} /></dd></div>
        <div className="wide"><dt>Next step</dt><dd><input defaultValue={deal.next_step} disabled={!canEdit || !open} placeholder="What happens next"
          onBlur={e => { const v = e.target.value.trim(); if (v !== deal.next_step) updateDeal(deal, { next_step: v }); }} />
          {open && <span className={'due' + (n !== null && n < 0 ? ' late' : '')}>{fmtDue(deal.next_step_at)}</span>}</dd></div>
      </dl>
    </div>
  );
}

function ProjectDrawer({ id }: { id: string }) {
  const store = useStore();
  const ui = useUI();
  const p = store.projects.find(x => x.id === id);
  const [task, setTask] = useState('');
  if (!p) return <div className="loading">This project was deleted.</div>;
  const tasks = store.project_tasks.filter(t => t.project_id === p.id);
  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const canEdit = store.isLead || p.owner_id === store.me.id;
  async function save(patch: Record<string, unknown>) {
    const { data, error } = await supabase.from('projects').update(patch).eq('id', p!.id).select().single();
    if (error) return ui.toast(friendlyError(error.message));
    store.put('projects', data);
    ui.toast('Saved');
  }
  async function toggle(tid: string, v: boolean) {
    const { data, error } = await supabase.from('project_tasks').update({ done: v }).eq('id', tid).select().single();
    if (error) return ui.toast(friendlyError(error.message));
    store.put('project_tasks', data);
  }
  async function addTask() {
    const title = task.trim();
    if (!title) return;
    const { data, error } = await supabase.from('project_tasks').insert({ project_id: p!.id, title, position: tasks.length }).select().single();
    if (error) return ui.toast(friendlyError(error.message));
    store.put('project_tasks', data);
    setTask('');
  }
  async function removeTask(tid: string) {
    const { error } = await supabase.from('project_tasks').delete().eq('id', tid);
    if (error) return ui.toast(friendlyError(error.message));
    store.drop('project_tasks', tid);
  }
  return (
    <div key={p.id}>
      <Head title={p.name} sub={p.client_name} avatar={p.client_name} />
      <dl className="fields" style={{ marginTop: 18 }}>
        <div className="wide"><dt>Project name</dt><dd><input defaultValue={p.name} disabled={!canEdit} onBlur={e => e.target.value.trim() && e.target.value.trim() !== p.name && save({ name: cleanText(e.target.value, 120) })} /></dd></div>
        <div><dt>Stage</dt><dd><select value={p.stage} disabled={!canEdit} onChange={e => save({ stage: e.target.value })}>{PROJECT_STAGES.map(s => <option key={s}>{s}</option>)}</select></dd></div>
        <div><dt>Owner</dt><dd><select value={p.owner_id || ''} disabled={!canEdit} onChange={e => save({ owner_id: e.target.value || null })}>
          <option value="">Unassigned</option>{store.profiles.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></dd></div>
        <div><dt>Due</dt><dd><input type="date" defaultValue={p.due_date || ''} disabled={!canEdit} onBlur={e => (e.target.value || null) !== p.due_date && save({ due_date: e.target.value || null })} /></dd></div>
        <div><dt>Client</dt><dd><input defaultValue={p.client_name} disabled={!canEdit} onBlur={e => e.target.value.trim() && e.target.value.trim() !== p.client_name && save({ client_name: cleanText(e.target.value, 120) })} /></dd></div>
      </dl>
      <div className="prog-line"><div className={'bar' + (pct === 100 ? ' done' : '')}><i style={{ width: pct + '%' }} /></div><span>{done} of {tasks.length} done</span></div>
      <section className="sec"><h3>Checklist</h3>
        <ul className="tasks">{tasks.map(t => (
          <li key={t.id} className={t.done ? 'done' : ''} style={{ display: 'flex', alignItems: 'center' }}>
            <label style={{ flex: 1 }}><input type="checkbox" checked={t.done} disabled={!canEdit} onChange={e => toggle(t.id, e.target.checked)} /><span>{t.title}</span></label>
            {canEdit && <button className="icon-btn" onClick={() => removeTask(t.id)} aria-label={'Delete task ' + t.title}><Icon name="trash" size={13} /></button>}
          </li>))}</ul>
        {canEdit && <form className="note-form" onSubmit={e => { e.preventDefault(); addTask(); }}>
          <input value={task} onChange={e => setTask(e.target.value)} placeholder="Add a task" aria-label="New task" /><button className="btn sm">Add task</button></form>}
      </section>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {p.contact_id && store.contactById(p.contact_id) && <button className="btn sm" onClick={() => ui.openDrawer({ kind: 'contact', id: p.contact_id! })}>Open client</button>}
        {store.isLead && <button className="btn sm danger" onClick={() => ui.openModal(<ConfirmModal title="Delete project" submit="Delete" text="This deletes the project and its checklist." onConfirm={async () => {
          const { error } = await supabase.from('projects').delete().eq('id', p.id);
          if (error) return ui.toast(friendlyError(error.message));
          store.drop('projects', p.id); ui.closeDrawer(); ui.toast('Project deleted');
        }} />)}>Delete project</button>}
      </div>
    </div>
  );
}

function StagesDrawer({ id }: { id: string }) {
  const store = useStore();
  const ui = useUI();
  const pid = store.pipelines.some(p => p.id === id) ? id : store.pipelines[0]?.id;
  const pipe = store.pipelines.find(p => p.id === pid);
  if (!pipe) return <div className="loading">No pipelines yet.</div>;
  const stages = store.pipelineStages(pipe.id);
  const open = stages.filter(s => s.kind === 'open');
  const closed = stages.filter(s => s.kind !== 'open');
  const cnt = (sid: string) => store.deals.filter(d => d.stage_id === sid).length;
  const lead = store.isLead;

  async function reposition(order: Stage[]) {
    const rows = order.map((s, i) => ({ ...s, position: i }));
    const { data, error } = await supabase.from('stages').upsert(rows).select();
    if (error) return ui.toast(friendlyError(error.message));
    (data || []).forEach(r => store.put('stages', r));
  }
  const move = (i: number, j: number) => { const o = [...open]; [o[i], o[j]] = [o[j], o[i]]; reposition([...o, ...closed]); };
  async function rename(s: Stage, v: string) {
    const n = cleanText(v, 40);
    if (!n || n === s.name) return;
    if (stages.some(x => x.id !== s.id && x.name.toLowerCase() === n.toLowerCase())) return ui.toast('Use a unique stage name');
    const { data, error } = await supabase.from('stages').update({ name: n }).eq('id', s.id).select().single();
    if (error) return ui.toast(friendlyError(error.message));
    store.put('stages', data); ui.toast('Stage renamed');
  }
  async function removeStage(i: number) {
    const s = open[i], to = open[i - 1] || open[i + 1];
    const n = cnt(s.id);
    if (n) {
      const { error } = await supabase.from('deals').update({ stage_id: to.id }).eq('stage_id', s.id);
      if (error) return ui.toast(friendlyError(error.message));
      store.deals.filter(d => d.stage_id === s.id).forEach(d => store.put('deals', { ...d, stage_id: to.id }));
    }
    const { error } = await supabase.from('stages').delete().eq('id', s.id);
    if (error) return ui.toast(friendlyError(error.message));
    store.drop('stages', s.id);
    ui.toast(n ? `Stage deleted. ${n} moved to ${to.name}` : 'Stage deleted');
  }
  async function addStage(v: string) {
    const n = cleanText(v, 40);
    if (!n || stages.some(x => x.name.toLowerCase() === n.toLowerCase())) return ui.toast('Use a new, unique stage name');
    const { data, error } = await supabase.from('stages').insert({ pipeline_id: pipe!.id, name: n, position: open.length, kind: 'open' }).select().single();
    if (error || !data) return ui.toast(friendlyError(error?.message));
    store.put('stages', data);
    await reposition([...open, data, ...closed]);
    ui.toast('Stage added');
  }
  async function renamePipe(v: string) {
    const n = cleanText(v, 60);
    if (!n || n === pipe!.name) return;
    const { data, error } = await supabase.from('pipelines').update({ name: n, short_name: n.split(' ')[0] }).eq('id', pipe!.id).select().single();
    if (error) return ui.toast(friendlyError(error.message));
    store.put('pipelines', data); ui.toast('Saved');
  }
  async function deletePipe() {
    if (store.pipelines.length < 2) return ui.toast('You need at least one pipeline');
    const used = store.deals.filter(d => d.pipeline_id === pipe!.id).length;
    if (used) return ui.toast(`Move or delete its ${used} deals first`);
    const { error } = await supabase.from('pipelines').delete().eq('id', pipe!.id);
    if (error) return ui.toast(friendlyError(error.message));
    stages.forEach(s => store.drop('stages', s.id));
    store.drop('pipelines', pipe!.id);
    const next = store.pipelines.find(p => p.id !== pipe!.id)!;
    ui.setPipe(next.id); ui.openDrawer({ kind: 'stages', id: next.id }); ui.toast('Pipeline deleted');
  }

  return (
    <div key={pipe.id}>
      <Head title="Pipelines and stages" sub={lead ? 'Changes apply to the whole team.' : 'Only admins and managers can change these.'} />
      <div style={{ display: 'flex', gap: 8, margin: '18px 0 0' }}>
        <select value={pipe.id} onChange={e => { ui.setPipe(e.target.value); ui.openDrawer({ kind: 'stages', id: e.target.value }); }} aria-label="Pipeline">
          {store.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {lead && <button className="btn sm" style={{ height: 34 }} onClick={() => ui.openModal(<NewPipelineModal />)}>New pipeline</button>}
      </div>
      <dl className="fields" style={{ margin: '16px 0 18px' }}><div className="wide"><dt>Name</dt><dd>
        <input key={pipe.name} defaultValue={pipe.name} disabled={!lead} onBlur={e => renamePipe(e.target.value)} aria-label="Pipeline name" /></dd></div></dl>
      <section className="sec"><h3>Stages</h3>
        <ul className="stages">
          {open.map((s, i) => (
            <li key={s.id + s.name}>
              <input defaultValue={s.name} disabled={!lead} onBlur={e => rename(s, e.target.value)} aria-label="Stage name" />
              <span className="cnt" title="Deals in this stage">{cnt(s.id)}</span>
              {lead && <>
                <button className="icon-btn" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up"><Icon name="up" size={14} /></button>
                <button className="icon-btn" disabled={i === open.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down"><Icon name="down" size={14} /></button>
                <button className="icon-btn" disabled={open.length < 2} onClick={() => removeStage(i)} aria-label="Delete stage"><Icon name="trash" size={14} /></button>
              </>}
            </li>
          ))}
          {closed.map(s => <li className="locked" key={s.id}><span>{s.name}</span><span className="cnt">{cnt(s.id)}</span></li>)}
        </ul>
        <p className="muted small" style={{ margin: '0 0 10px' }}>Won and Lost are fixed so reports stay accurate.</p>
        {lead && <form className="note-form" onSubmit={e => { e.preventDefault(); const el = e.currentTarget.elements.namedItem('t') as HTMLInputElement; addStage(el.value); el.value = ''; }}>
          <input name="t" placeholder="New stage" aria-label="New stage name" /><button className="btn sm">Add stage</button></form>}
      </section>
      {lead && <button className="btn sm danger" style={{ marginTop: 14 }} onClick={deletePipe}>Delete pipeline</button>}
    </div>
  );
}

function NewPipelineModal() {
  const store = useStore();
  const ui = useUI();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = cleanText(name, 60);
    if (!n) return setErr('Add a name.');
    if (store.pipelines.some(p => p.name.toLowerCase() === n.toLowerCase())) return setErr('A pipeline with this name already exists.');
    setBusy(true);
    const { data: p, error } = await supabase.from('pipelines').insert({ name: n, short_name: n.split(' ')[0], position: store.pipelines.length }).select().single();
    if (error || !p) { setBusy(false); return setErr(friendlyError(error?.message)); }
    store.put('pipelines', p);
    const rows = [['New lead', 'open'], ['In progress', 'open'], ['Won', 'won'], ['Lost', 'lost']].map(([nm, kind], position) => ({ pipeline_id: p.id, name: nm, kind, position }));
    const { data: st } = await supabase.from('stages').insert(rows).select();
    (st || []).forEach(s => store.put('stages', s));
    setBusy(false);
    ui.closeModal(); ui.setPipe(p.id); ui.openDrawer({ kind: 'stages', id: p.id }); ui.toast('Pipeline created');
  }
  return (
    <Modal title="New pipeline" submit="Create pipeline" onSubmit={submit} error={err} busy={busy}>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="For example, Partnerships" /></label>
      <p className="m-sub small">Starts with New lead, In progress, Won and Lost.</p>
    </Modal>
  );
}
