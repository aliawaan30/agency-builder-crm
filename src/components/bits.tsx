import { useEffect, useRef, type ReactNode } from 'react';
import { hue, initials } from '../lib/format';
import type { Deal, Profile, Stage } from '../lib/types';
import { useUI } from '../lib/ui';

const P: Record<string, string> = {
  dashboard: '<path d="M3 20h18M6 16v-5M11 16V6M16 16v-8M21 16v-3"/>',
  pipeline: '<rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="10" y="4" width="5" height="11" rx="1.2"/><rect x="17" y="4" width="4" height="7" rx="1.2"/>',
  contacts: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m9 13.5 2 2 4-4"/>',
  team: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ask: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5 4v-4h0A2 2 0 0 1 4 14z"/><path d="M8.5 8.5h7M8.5 11.5h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  phone: '<path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 7.2 7.2l1.4-2.1 4.2 1.6V19a1.8 1.8 0 0 1-1.9 1.8C10.5 20.4 3.6 13.5 3.2 5.4A1.8 1.8 0 0 1 5 3.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  note: '<path d="M6 3.5h12v17H6z"/><path d="M9.5 8.5h5M9.5 12.5h5"/>',
  stage: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  created: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  sortUp: '<path d="m8 14 4-4 4 4"/>',
  sortDown: '<path d="m8 10 4 4 4-4"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'
};
export function Icon({ name, size = 15 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] || '' }} />
  );
}

export function Avatar({ name, large, title }: { name: string; large?: boolean; title?: string }) {
  return <span className={'av' + (large ? ' lg' : '')} style={{ ['--h' as any]: hue(name) }} title={title || name}>{initials(name)}</span>;
}
export function PersonAvatar({ p }: { p?: Profile }) {
  return <Avatar name={p?.full_name || 'Unassigned'} title={p?.full_name || 'Unassigned'} />;
}

export function stageClass(stage: Stage | undefined, all: Stage[]): string {
  if (!stage) return '';
  if (stage.kind === 'won') return 'won';
  if (stage.kind === 'lost') return 'lost';
  const open = all.filter(s => s.pipeline_id === stage.pipeline_id && s.kind === 'open');
  const i = open.findIndex(s => s.id === stage.id);
  if (i <= 0) return '';
  return open.length > 2 && i >= open.length - 2 ? 'late' : 'mid';
}
export function StageLabel({ stage, all }: { stage?: Stage; all: Stage[] }) {
  return <span className={'st ' + stageClass(stage, all)}><i />{stage?.name || 'Unknown'}</span>;
}
export const isOpenDeal = (d: Deal, stageById: (id: string) => Stage | undefined) => stageById(d.stage_id)?.kind === 'open';

export function Tag({ t, onRemove }: { t: string; onRemove?: () => void }) {
  return (
    <span className="tag" style={{ ['--h' as any]: hue(t) }}>
      {t}
      {onRemove && <button type="button" onClick={onRemove} aria-label={'Remove tag ' + t}><Icon name="x" size={11} /></button>}
    </span>
  );
}

export function Modal({ title, children, onSubmit, submit, error, busy, danger }: {
  title: string; children: ReactNode; onSubmit: () => void; submit: string; error?: string; busy?: boolean; danger?: boolean;
}) {
  const { closeModal } = useUI();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.m-body input:not([type=radio]):not([type=checkbox]),.m-body textarea,.m-body select') || ref.current?.querySelector<HTMLElement>('.m-foot .primary');
    el?.focus();
  }, []);
  return (
    <div className="modal-wrap" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <form ref={ref} noValidate onSubmit={e => { e.preventDefault(); if (!busy) onSubmit(); }}>
          <header className="m-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={closeModal} aria-label="Close"><Icon name="x" size={16} /></button></header>
          <div className="m-body">
            {children}
            {error && <p className="err">{error}</p>}
          </div>
          <footer className="m-foot">
            <button type="button" className="btn" onClick={closeModal}>Cancel</button>
            <button className={'btn primary' + (danger ? ' danger' : '')} disabled={busy}>{busy ? 'Saving' : submit}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="list empty">
      <p style={{ margin: '0 0 4px', color: 'var(--ink)', fontWeight: 500 }}>{title}</p>
      <p style={{ margin: children ? '0 0 16px' : 0 }}>{text}</p>
      {children && <div style={{ display: 'inline-flex', gap: 8 }}>{children}</div>}
    </div>
  );
}
