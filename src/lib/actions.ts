import { useNavigate } from 'react-router-dom';
import { daysFromNow } from './format';
import { useStore } from './store';
import { friendlyError, supabase } from './supabase';
import type { ActivityType, Deal } from './types';
import { useUI } from './ui';

export function useActions() {
  const store = useStore();
  const ui = useUI();
  const navigate = useNavigate();

  async function logActivity(contactId: string, dealId: string | null, type: ActivityType, body: string) {
    const { error } = await supabase.from('activities').insert({ contact_id: contactId, deal_id: dealId, type, body, created_by: store.me.id });
    if (error) ui.toast(friendlyError(error.message));
    return !error;
  }

  async function audit(action: string, detail: string) {
    await supabase.from('audit_log').insert({ actor_id: store.me.id, action, detail });
  }

  async function updateDeal(deal: Deal, patch: Partial<Deal>, quiet = false) {
    if (!store.canEditDeal(deal)) { ui.toast('Only the owner or a manager can change this deal.'); return false; }
    const { data, error } = await supabase.from('deals').update(patch).eq('id', deal.id).select().single();
    if (error) { ui.toast(friendlyError(error.message)); return false; }
    store.put('deals', data);
    if (!quiet) ui.toast('Saved');
    return true;
  }

  async function startProject(deal: Deal) {
    const c = store.contactById(deal.contact_id);
    if (!c) return;
    const due = daysFromNow(21).slice(0, 10);
    const { data, error } = await supabase.from('projects').insert({
      name: 'New delivery project', client_name: c.company || c.full_name, contact_id: c.id, deal_id: deal.id,
      pipeline_id: deal.pipeline_id, owner_id: store.me.id, stage: 'Kickoff', due_date: due
    }).select().single();
    if (error || !data) { ui.toast(friendlyError(error?.message)); return; }
    store.put('projects', data);
    const tasks = ['Kickoff call', 'Collect logins and access', 'Agree the build plan'].map((title, position) => ({ project_id: data.id, title, position }));
    const t = await supabase.from('project_tasks').insert(tasks).select();
    (t.data || []).forEach(row => store.put('project_tasks', row));
    navigate('/projects');
    ui.openDrawer({ kind: 'project', id: data.id });
  }

  async function moveDeal(deal: Deal, stageId: string) {
    if (deal.stage_id === stageId) return;
    const st = store.stageById(stageId);
    if (!st) return;
    if (st.pipeline_id !== deal.pipeline_id) return;
    const ok = await updateDeal(deal, { stage_id: stageId }, true);
    if (!ok) return;
    await logActivity(deal.contact_id, deal.id, 'stage', 'Moved to ' + st.name);
    if (st.kind === 'won') ui.toast('Marked as won', 'Start delivery project', () => startProject({ ...deal, stage_id: stageId }));
    else if (st.kind === 'lost') ui.toast('Marked as lost');
    else ui.toast('Moved to ' + st.name);
  }

  return { logActivity, audit, updateDeal, moveDeal, startProject };
}
