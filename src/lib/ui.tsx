import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface Filters {
  owner: string;
  due: 'any' | 'overdue' | 'today' | 'week' | 'none';
  source: string;
  tag: string;
  cold: boolean;
  pipeline: string; // contacts page only
  stage: string; // contacts page only
}
export const FILTER_DEFAULTS: Filters = { owner: 'all', due: 'any', source: 'all', tag: 'all', cold: false, pipeline: 'all', stage: 'all' };

export type DrawerState = { kind: 'contact' | 'project' | 'stages'; id: string } | null;
interface ToastState { msg: string; label?: string; fn?: () => void; key: number }

interface UI {
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: (f?: Partial<Filters>) => void;
  q: string;
  setQ: (q: string) => void;
  pipe: string;
  setPipe: (id: string) => void;
  pview: 'board' | 'list';
  setPview: (v: 'board' | 'list') => void;
  drawer: DrawerState;
  openDrawer: (d: DrawerState) => void;
  closeDrawer: () => void;
  modal: ReactNode;
  openModal: (n: ReactNode) => void;
  closeModal: () => void;
  toast: (msg: string, label?: string, fn?: () => void) => void;
  askOpen: boolean;
  setAskOpen: (v: boolean) => void;
  askSeed: string;
  askAbout: (q: string) => void;
  clearAskSeed: () => void;
}

const Ctx = createContext<UI | null>(null);
export const useUI = () => {
  const u = useContext(Ctx);
  if (!u) throw new Error('UI missing');
  return u;
};

function saved<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [filters, setF] = useState<Filters>(() => saved('crm.filters', FILTER_DEFAULTS));
  const [q, setQ] = useState('');
  const [pipe, setPipeState] = useState<string>(() => { try { return localStorage.getItem('crm.pipe') || ''; } catch { return ''; } });
  const [pview, setPviewState] = useState<'board' | 'list'>(() => { try { return (localStorage.getItem('crm.pview') as 'list') || 'board'; } catch { return 'board'; } });
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [modal, setModal] = useState<ReactNode>(null);
  const [toastState, setToast] = useState<ToastState | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askSeed, setAskSeed] = useState('');
  const timer = useRef<number>();

  useEffect(() => { try { localStorage.setItem('crm.filters', JSON.stringify(filters)); } catch { /* storage unavailable */ } }, [filters]);

  const toast = useCallback((msg: string, label?: string, fn?: () => void) => {
    setToast({ msg, label, fn, key: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), label ? 6000 : 2600);
  }, []);

  const value = useMemo<UI>(() => ({
    filters,
    setFilters: f => setF(prev => ({ ...prev, ...f })),
    resetFilters: f => setF({ ...FILTER_DEFAULTS, ...(f || {}) }),
    q, setQ,
    pipe,
    setPipe: id => { setPipeState(id); try { localStorage.setItem('crm.pipe', id); } catch { /* ignore */ } },
    pview,
    setPview: v => { setPviewState(v); try { localStorage.setItem('crm.pview', v); } catch { /* ignore */ } },
    drawer,
    openDrawer: d => setDrawer(d),
    closeDrawer: () => setDrawer(null),
    modal,
    openModal: n => setModal(n),
    closeModal: () => setModal(null),
    toast,
    askOpen, setAskOpen,
    askSeed,
    askAbout: (text: string) => { setAskSeed(text); setAskOpen(true); },
    clearAskSeed: () => setAskSeed('')
  }), [filters, q, pipe, pview, drawer, modal, toast, askOpen, askSeed]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={'toast' + (toastState ? ' show' : '')} role="status" aria-live="polite">
        {toastState && <>
          <span>{toastState.msg}</span>
          {toastState.label && <button type="button" onClick={() => { toastState.fn?.(); setToast(null); }}>{toastState.label}</button>}
        </>}
      </div>
    </Ctx.Provider>
  );
}
