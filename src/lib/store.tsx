import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Contact, Deal, Pipeline, Profile, Project, Stage, Task } from './types';

type TableName = 'profiles' | 'pipelines' | 'stages' | 'contacts' | 'deals' | 'projects' | 'project_tasks';
interface Rows {
  profiles: Profile[];
  pipelines: Pipeline[];
  stages: Stage[];
  contacts: Contact[];
  deals: Deal[];
  projects: Project[];
  project_tasks: Task[];
}
const EMPTY: Rows = { profiles: [], pipelines: [], stages: [], contacts: [], deals: [], projects: [], project_tasks: [] };
const TABLES = Object.keys(EMPTY) as TableName[];

interface Store extends Rows {
  me: Profile;
  loading: boolean;
  error: string;
  isLead: boolean;
  isAdmin: boolean;
  put: <T extends TableName>(table: T, row: Rows[T][number]) => void;
  drop: (table: TableName, id: string) => void;
  reload: () => Promise<void>;
  // lookups
  pipelineStages: (pipelineId: string) => Stage[];
  stageById: (id: string) => Stage | undefined;
  contactById: (id: string) => Contact | undefined;
  profileById: (id: string | null) => Profile | undefined;
  dealsOf: (contactId: string) => Deal[];
  canEditDeal: (d: Deal) => boolean;
  canEditContact: (c: Contact) => boolean;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store missing');
  return s;
};

const norm = (t: TableName, r: any) => (t === 'deals' ? { ...r, value: Number(r.value) } : r);
const sortRows = (t: TableName, rows: any[]) => {
  if (t === 'pipelines' || t === 'stages' || t === 'project_tasks') return [...rows].sort((a, b) => a.position - b.position);
  return rows;
};

export function StoreProvider({ me: initialMe, children }: { me: Profile; children: ReactNode }) {
  const [rows, setRows] = useState<Rows>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const results = await Promise.all(TABLES.map(t => supabase.from(t).select('*').limit(10000)));
    if (!mounted.current) return;
    const bad = results.find(r => r.error);
    if (bad?.error) { setError(bad.error.message); setLoading(false); return; }
    const next = { ...EMPTY } as any;
    TABLES.forEach((t, i) => { next[t] = sortRows(t, (results[i].data || []).map(r => norm(t, r))); });
    setRows(next);
    setError('');
    setLoading(false);
  }, []);

  const put = useCallback((table: TableName, row: any) => {
    setRows(prev => {
      const list = prev[table] as any[];
      const r = norm(table, row);
      const i = list.findIndex(x => x.id === r.id);
      const nextList = i === -1 ? [...list, r] : list.map((x, j) => (j === i ? { ...x, ...r } : x));
      return { ...prev, [table]: sortRows(table, nextList) };
    });
  }, []);
  const drop = useCallback((table: TableName, id: string) => {
    setRows(prev => ({ ...prev, [table]: (prev[table] as any[]).filter(x => x.id !== id) }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    // Live updates from teammates. Row level security still applies.
    const ch = supabase.channel('crm-live');
    TABLES.forEach(t => {
      ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, (p: any) => {
        if (p.eventType === 'DELETE') { if (p.old?.id) drop(t, p.old.id); }
        else if (p.new) put(t, p.new);
      });
    });
    ch.subscribe();
    // Refresh when the tab comes back, in case realtime missed something.
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', initialMe.id).then(() => {});
    return () => { mounted.current = false; supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [load, put, drop, initialMe.id]);

  const value = useMemo<Store>(() => {
    const me = rows.profiles.find(p => p.id === initialMe.id) || initialMe;
    const isLead = me.role === 'admin' || me.role === 'manager';
    const isAdmin = me.role === 'admin';
    return {
      ...rows,
      me,
      loading,
      error,
      isLead,
      isAdmin,
      put: put as Store['put'],
      drop,
      reload: load,
      pipelineStages: (pid: string) => rows.stages.filter(s => s.pipeline_id === pid),
      stageById: (id: string) => rows.stages.find(s => s.id === id),
      contactById: (id: string) => rows.contacts.find(c => c.id === id),
      profileById: (id: string | null) => (id ? rows.profiles.find(p => p.id === id) : undefined),
      dealsOf: (cid: string) => rows.deals.filter(d => d.contact_id === cid),
      canEditDeal: (d: Deal) => isLead || d.owner_id === me.id,
      canEditContact: (c: Contact) => isLead || c.owner_id === me.id || c.created_by === me.id
    };
  }, [rows, loading, error, initialMe, put, drop, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
