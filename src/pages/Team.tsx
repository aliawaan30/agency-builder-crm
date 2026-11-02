import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '../components/bits';
import { ConfirmModal, InviteModal } from '../components/Modals';
import { useActions } from '../lib/actions';
import { fmtAgo } from '../lib/format';
import { useStore } from '../lib/store';
import { friendlyError, supabase } from '../lib/supabase';
import { ROLE_LABEL, type AuditRow, type Invite, type Profile, type Role } from '../lib/types';
import { useUI } from '../lib/ui';

export default function Team() {
  const store = useStore();
  const ui = useUI();
  const { audit } = useActions();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [log, setLog] = useState<AuditRow[]>([]);

  const loadLead = useCallback(async () => {
    if (!store.isLead) return;
    const [i, l] = await Promise.all([
      supabase.from('team_invites').select('*').order('created_at', { ascending: false }),
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50)
    ]);
    setInvites(i.data || []);
    setLog(l.data || []);
  }, [store.isLead]);
  useEffect(() => {
    loadLead();
    const h = () => loadLead();
    window.addEventListener('crm:invites', h);
    return () => window.removeEventListener('crm:invites', h);
  }, [loadLead]);

  async function update(p: Profile, patch: Partial<Profile>, msg: string) {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', p.id).select().single();
    if (error) return ui.toast(friendlyError(error.message));
    store.put('profiles', data);
    await audit('team', msg);
    ui.toast('Saved');
    loadLead();
  }
  async function cancelInvite(email: string) {
    const { error } = await supabase.from('team_invites').delete().eq('email', email);
    if (error) return ui.toast(friendlyError(error.message));
    await audit('invite', `${store.me.full_name} cancelled the invite for ${email}`);
    loadLead();
  }

  const people = [...store.profiles].sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name));
  const link = window.location.origin;

  return <>
    <div className="ph"><h1>Team</h1><span className="meta">{store.profiles.filter(p => p.active).length} active</span>
      {store.isLead && <div className="acts"><button className="btn sm primary" onClick={() => ui.openModal(<InviteModal />)}>Invite</button></div>}</div>

    <section className="panel">
      <h2>People</h2>
      <p className="muted small note">Admins manage the team and can export. Managers see and edit everything and can invite closers and setters. Closers and setters see everything and edit their own contacts and deals.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Role</th><th>Last active</th><th>Access</th></tr></thead>
        <tbody>{people.map(p => <tr key={p.id}>
          <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar name={p.full_name} /><div><strong>{p.full_name}</strong><span className="sub2">{p.email}</span></div></div></td>
          <td>{store.isAdmin && p.id !== store.me.id
            ? <select value={p.role} aria-label={'Role for ' + p.full_name} onChange={e => update(p, { role: e.target.value as Role }, `${store.me.full_name} changed ${p.full_name} to ${ROLE_LABEL[e.target.value as Role]}`)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            : <>{ROLE_LABEL[p.role]}{p.id === store.me.id && <span className="muted small"> (you)</span>}</>}</td>
          <td>{p.last_seen_at ? fmtAgo(p.last_seen_at).replace(/^./, m => m.toUpperCase()) : 'Never'}</td>
          <td>{store.isAdmin && p.id !== store.me.id
            ? <button className={'btn sm' + (p.active ? ' danger' : '')} onClick={() => p.active
                ? ui.openModal(<ConfirmModal title="Remove access" submit="Remove access" text={`${p.full_name} won’t be able to sign in or load any data. Their contacts and deals stay in the CRM.`}
                    onConfirm={() => update(p, { active: false }, `${store.me.full_name} removed access for ${p.full_name}`)} />)
                : update(p, { active: true }, `${store.me.full_name} restored access for ${p.full_name}`)}>
                {p.active ? 'Remove access' : 'Restore access'}</button>
            : <span className={'st ' + (p.active ? 'won' : 'lost')}><i />{p.active ? 'Active' : 'Removed'}</span>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    {store.isLead && <section className="panel">
      <h2>Pending invites</h2>
      {invites.length === 0 ? <p className="muted small note">No pending invites.</p> : invites.map(i => (
        <div className="srow" key={i.email}><div><strong>{i.full_name || i.email}</strong><p>{i.email}, {ROLE_LABEL[i.role]}, invited {fmtAgo(i.created_at)}</p></div>
          <button className="btn sm" onClick={() => cancelInvite(i.email)}>Cancel</button></div>
      ))}
      <p className="muted small" style={{ margin: '10px 0' }}>Send invited people this link: <code>{link}</code></p>
    </section>}

    <section className="panel">
      <h2>Sign in and security</h2>
      <div className="srow"><div><strong>Invite only</strong><p>Only emails on the invite list can create an account, through Google or an email code.</p></div><span className="st won"><i />On</span></div>
      <div className="srow"><div><strong>Row level security</strong><p>The database checks every read and write against the person’s role, even if someone edits the page.</p></div><span className="st won"><i />On</span></div>
      <div className="srow"><div><strong>Your other sessions</strong><p>Signs you out on every other browser and phone.</p></div>
        <button className="btn sm" onClick={async () => { const { error } = await supabase.auth.signOut({ scope: 'others' }); ui.toast(error ? friendlyError(error.message) : 'Signed out everywhere else'); }}>Sign out other devices</button></div>
    </section>

    {store.isLead && <section className="panel">
      <h2>Activity log</h2>
      <ul className="log">{log.map(a => <li key={a.id}><span>{a.detail || a.action}</span><span>{fmtAgo(a.created_at)}</span></li>)}</ul>
      {!log.length && <p className="muted small note">Nothing yet.</p>}
    </section>}
  </>;
}
