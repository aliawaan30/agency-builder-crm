import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Contacts from '../pages/Contacts';
import Dashboard from '../pages/Dashboard';
import Pipeline from '../pages/Pipeline';
import Projects from '../pages/Projects';
import Team from '../pages/Team';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { ROLE_LABEL } from '../lib/types';
import { useUI } from '../lib/ui';
import { AskPanel } from './Ask';
import { Avatar, Icon } from './bits';
import { Drawer } from './Drawers';
import { SAVED_VIEWS, viewMatches } from './Filters';
import { NewContactModal } from './Modals';

const THEMES = ['system', 'light', 'dark'] as const;

export default function Shell() {
  const store = useStore();
  const ui = useUI();
  const loc = useLocation();
  const navigate = useNavigate();
  const search = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>(() => { try { return (localStorage.getItem('crm.theme') as 'light') || 'system'; } catch { return 'system'; } });

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('crm.theme', theme); } catch { /* ignore */ }
  }, [theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input,textarea,select')) { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.querySelector('.main')?.scrollTo(0, 0); }, [loc.pathname]);

  const openCalls = store.deals.filter(d => store.stageById(d.stage_id)?.kind === 'open');
  const nav: [string, string, string, number | ''][] = [
    ['/', 'Dashboard', 'dashboard', ''],
    ['/pipeline', 'Pipeline', 'pipeline', openCalls.length],
    ['/contacts', 'Contacts', 'contacts', store.contacts.length],
    ['/projects', 'Projects', 'projects', store.projects.filter(p => p.stage !== 'Live').length],
    ['/team', 'Team', 'team', '']
  ];

  if (store.loading) return <div className="loading"><span className="spin" /></div>;
  if (store.error) return <div className="center-note"><h1>Couldn’t load the CRM</h1><p>{store.error}</p><button className="btn" onClick={() => store.reload()}>Try again</button></div>;

  return (
    <div className={'app' + (ui.askOpen ? ' chat-open' : '')}>
      <nav className="side" aria-label="Main">
        <div className="ws"><span className="mark">AB</span><span className="ws-name">Agency Builder CRM</span></div>
        <div className="nav">
          {nav.map(([to, label, icon, count]) => (
            <NavLink key={to} to={to} end={to === '/'}><Icon name={icon} /><span>{label}</span><span className="count">{count}</span></NavLink>
          ))}
        </div>
        <div className="side-h">Saved views</div>
        <div className="nav">
          {SAVED_VIEWS.map(v => (
            <button key={v.id} className="vlink" aria-current={viewMatches(v, loc.pathname, ui.filters)}
              onClick={() => { ui.resetFilters({ ...v.set, pipeline: 'all', stage: 'all' }); navigate(v.path); }}>
              <i style={{ background: v.color }} />{v.label}</button>
          ))}
        </div>
        <div className="side-foot">
          <div className="me"><Avatar name={store.me.full_name} /><div>{store.me.full_name}<small>{ROLE_LABEL[store.me.role]}</small></div></div>
          <div className="side-actions">
            <button className="btn ghost sm" onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % 3])}>{theme === 'system' ? 'Theme: auto' : 'Theme: ' + theme}</button>
            <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </nav>
      <div className="main">
        <header className="top">
          <label className="search"><Icon name="search" size={14} />
            <input ref={search} type="search" placeholder="Search contacts" aria-label="Search contacts" value={ui.q}
              onChange={e => { ui.setQ(e.target.value); if (loc.pathname !== '/contacts') navigate('/contacts'); }} /><kbd>/</kbd></label>
          <div className="spacer" />
          <button className="btn sm" aria-expanded={ui.askOpen} onClick={() => ui.setAskOpen(!ui.askOpen)}><Icon name="ask" size={14} /><span className="lbl">Ask</span></button>
          <button className="btn primary sm" onClick={() => ui.openModal(<NewContactModal />)}><Icon name="plus" size={14} /><span className="lbl">New contact</span></button>
        </header>
        <div className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/team" element={<Team />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </div>
      </div>
      {ui.askOpen && <AskPanel />}
      <Drawer />
      {ui.modal}
    </div>
  );
}
