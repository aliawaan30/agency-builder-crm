import { useState } from 'react';
import { useActions } from '../lib/actions';
import { cleanText, daysFromNow, firstName, guessTimezone, isEmail, theirTime, TIMEZONES } from '../lib/format';
import { useStore } from '../lib/store';
import { friendlyError, supabase } from '../lib/supabase';
import { ROLE_LABEL, SOURCES, type Deal, type Role } from '../lib/types';
import { useUI } from '../lib/ui';
import { Modal } from './bits';

export function LogCallModal({ deal }: { deal: Deal }) {
  const store = useStore();
  const { closeModal, toast } = useUI();
  const { logActivity, updateDeal } = useActions();
  const c = store.contactById(deal.contact_id)!;
  const [outcome, setOutcome] = useState('Connected');
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState(deal.next_step);
  const [when, setWhen] = useState('1');
  const [busy, setBusy] = useState(false);
  const canEdit = store.canEditDeal(deal);
  async function submit() {
    setBusy(true);
    const ok = await logActivity(c.id, deal.id, 'call', outcome + (notes.trim() ? '. ' + notes.trim() : '.'));
    if (ok && canEdit) await updateDeal(deal, { next_step: next.trim(), next_step_at: when ? daysFromNow(+when) : null }, true);
    setBusy(false);
    if (ok) { closeModal(); toast('Call logged'); }
  }
  return (
    <Modal title={'Log call with ' + firstName(c.full_name)} submit="Save" onSubmit={submit} busy={busy}>
      <p className="m-sub">{c.full_name}{c.company ? ', ' + c.company : ''}. {theirTime(c.timezone).time} their time.</p>
      <fieldset className="chips"><legend>Outcome</legend>
        {['Connected', 'No answer', 'Left voicemail', 'Booked a call'].map(o => (
          <label key={o}><input type="radio" name="o" checked={outcome === o} onChange={() => setOutcome(o)} /><span>{o}</span></label>
        ))}
      </fieldset>
      <label>Notes<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you learn?" /></label>
      {canEdit ? (
        <div className="row2">
          <label>Next step<input value={next} onChange={e => setNext(e.target.value)} /></label>
          <label>When<select value={when} onChange={e => setWhen(e.target.value)}>
            <option value="1">Tomorrow</option><option value="2">In 2 days</option><option value="7">Next week</option><option value="">No next step</option>
          </select></label>
        </div>
      ) : <p className="ro">The next step can only be changed by the deal owner or a manager.</p>}
    </Modal>
  );
}

export function NewContactModal() {
  const store = useStore();
  const { closeModal, toast, openDrawer } = useUI();
  const { logActivity } = useActions();
  const firstPipe = store.pipelines[0]?.id || '';
  const [f, setF] = useState({ name: '', company: '', email: '', phone: '', city: '', timezone: 'America/New_York', tzTouched: false, source: 'Onboarding', pipeline: firstPipe, value: '10000', owner: store.me.id, tags: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF(prev => ({ ...prev, ...p }));
  async function submit() {
    const email = f.email.trim().toLowerCase();
    const value = parseInt(f.value.replace(/\D/g, ''), 10) || 0;
    if (!f.name.trim()) return setErr('Add a name.');
    if (email && !isEmail(email)) return setErr('Check the email address.');
    if (!f.pipeline) return setErr('Create a pipeline first.');
    const firstStage = store.pipelineStages(f.pipeline).find(s => s.kind === 'open');
    if (!firstStage) return setErr('That pipeline has no open stages.');
    setBusy(true);
    const { data: c, error } = await supabase.from('contacts').insert({
      full_name: cleanText(f.name, 120), company: cleanText(f.company, 120), email: email || null, phone: f.phone.trim(),
      city: cleanText(f.city, 80), timezone: f.timezone, source: f.source, owner_id: f.owner, created_by: store.me.id,
      tags: [...new Set(f.tags.split(',').map(t => cleanText(t, 24)).filter(Boolean))]
    }).select().single();
    if (error || !c) { setBusy(false); return setErr(friendlyError(error?.message)); }
    store.put('contacts', c);
    const { data: d, error: e2 } = await supabase.from('deals').insert({
      contact_id: c.id, pipeline_id: f.pipeline, stage_id: firstStage.id, value, owner_id: f.owner,
      next_step: 'First call', next_step_at: new Date(Date.now() + 3600e3).toISOString(), created_by: store.me.id
    }).select().single();
    if (d) store.put('deals', d);
    await logActivity(c.id, d?.id || null, 'created', 'Added by hand. Source: ' + f.source);
    setBusy(false);
    if (e2) toast(friendlyError(e2.message));
    closeModal();
    openDrawer({ kind: 'contact', id: c.id });
    toast('Contact added');
  }
  return (
    <Modal title="New contact" submit="Add contact" onSubmit={submit} error={err} busy={busy}>
      <label>Full name<input value={f.name} onChange={e => set({ name: e.target.value })} autoComplete="off" /></label>
      <label>Business <span className="opt">Leave empty for agency leads</span><input value={f.company} onChange={e => set({ company: e.target.value })} autoComplete="off" /></label>
      <div className="row2">
        <label>Email<input type="email" value={f.email} onChange={e => set({ email: e.target.value })} autoComplete="off" /></label>
        <label>Phone<input type="tel" value={f.phone} onChange={e => set({ phone: e.target.value })} autoComplete="off" /></label>
      </div>
      <div className="row2">
        <label>City<input value={f.city} placeholder="Sydney, NSW" onChange={e => set({ city: e.target.value, timezone: f.tzTouched ? f.timezone : guessTimezone(e.target.value, f.timezone) })} /></label>
        <label>Time zone<select value={f.timezone} onChange={e => set({ timezone: e.target.value, tzTouched: true })}>
          {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></label>
      </div>
      <div className="row2">
        <label>Pipeline<select value={f.pipeline} onChange={e => set({ pipeline: e.target.value })}>
          {store.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Deal value (USD)<input inputMode="numeric" value={f.value} onChange={e => set({ value: e.target.value })} /></label>
      </div>
      <div className="row2">
        <label>Owner<select value={f.owner} onChange={e => set({ owner: e.target.value })}>
          {store.profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select></label>
        <label>Source<select value={f.source} onChange={e => set({ source: e.target.value })}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></label>
      </div>
      <label>Tags <span className="opt">comma separated</span><input value={f.tags} onChange={e => set({ tags: e.target.value })} autoComplete="off" /></label>
    </Modal>
  );
}

export function AddDealModal({ contactId }: { contactId: string }) {
  const store = useStore();
  const { closeModal, toast } = useUI();
  const { logActivity } = useActions();
  const [pipeline, setPipeline] = useState(store.pipelines[0]?.id || '');
  const [value, setValue] = useState('10000');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const st = store.pipelineStages(pipeline).find(s => s.kind === 'open');
    if (!st) return setErr('That pipeline has no open stages.');
    setBusy(true);
    const { data, error } = await supabase.from('deals').insert({
      contact_id: contactId, pipeline_id: pipeline, stage_id: st.id, value: parseInt(value.replace(/\D/g, ''), 10) || 0,
      owner_id: store.me.id, created_by: store.me.id, next_step: 'First call', next_step_at: daysFromNow(1)
    }).select().single();
    setBusy(false);
    if (error || !data) return setErr(friendlyError(error?.message));
    store.put('deals', data);
    await logActivity(contactId, data.id, 'created', 'New deal in ' + (store.pipelines.find(p => p.id === pipeline)?.name || ''));
    closeModal();
    toast('Deal added');
  }
  return (
    <Modal title="Add a deal" submit="Add deal" onSubmit={submit} error={err} busy={busy}>
      <label>Pipeline<select value={pipeline} onChange={e => setPipeline(e.target.value)}>{store.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Deal value (USD)<input inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} /></label>
    </Modal>
  );
}

export function InviteModal() {
  const store = useStore();
  const { closeModal, toast } = useUI();
  const { audit } = useActions();
  const roles: Role[] = store.isAdmin ? ['admin', 'manager', 'closer', 'setter'] : ['closer', 'setter'];
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('setter');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const e = email.trim().toLowerCase();
    if (!isEmail(e)) return setErr('Enter a valid email.');
    if (store.profiles.some(p => p.email === e)) return setErr('That person is already on the team.');
    setBusy(true);
    const { error } = await supabase.from('team_invites').insert({ email: e, role, full_name: cleanText(name, 80), invited_by: store.me.id });
    setBusy(false);
    if (error) return setErr(error.message.includes('duplicate') ? 'That email already has an invite.' : friendlyError(error.message));
    await audit('invite', `${store.me.full_name} invited ${e} as ${ROLE_LABEL[role]}`);
    closeModal();
    toast('Invite saved. Send them the CRM link.');
    window.dispatchEvent(new Event('crm:invites'));
  }
  return (
    <Modal title="Invite to the CRM" submit="Save invite" onSubmit={submit} error={err} busy={busy}>
      <label>Work email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" /></label>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Role<select value={role} onChange={e => setRole(e.target.value as Role)}>{roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
      <p className="m-sub small">They sign in with Google or an email code using this exact email. No other email can get in.</p>
    </Modal>
  );
}

export function ConfirmModal({ title, text, submit, onConfirm }: { title: string; text: string; submit: string; onConfirm: () => Promise<void> | void }) {
  const { closeModal } = useUI();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} submit={submit} danger busy={busy} onSubmit={async () => { setBusy(true); await onConfirm(); setBusy(false); closeModal(); }}>
      <p className="m-sub">{text}</p>
    </Modal>
  );
}
