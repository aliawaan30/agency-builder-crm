import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useUI } from '../lib/ui';
import { Icon } from './bits';

interface Turn { role: 'user' | 'assistant'; content: string }
const SUGG = ['Who should I call first today?', 'Which deals are going cold?', 'What’s waiting on a proposal?', 'Summarise the agency pipeline'];

function render(text: string, open: (id: string) => void): ReactNode[] {
  const inline = (s: string, k: string) => {
    const parts: ReactNode[] = [];
    const re = /\[\[([0-9a-f-]{36})\|([^\]]+)\]\]|\*\*(.+?)\*\*/g;
    let last = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      const id = m[1];
      if (id) parts.push(<button key={k + i++} type="button" className="clink" onClick={() => open(id)}>{m[2]}</button>);
      else parts.push(<strong key={k + i++}>{m[3]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={'u' + out.length}>{list}</ul>); list = []; } };
  text.replace(/\u2014|\u2013/g, ',').split('\n').forEach((line, n) => {
    const t = line.trim();
    if (/^[-*] /.test(t)) { list.push(<li key={n}>{inline(t.slice(2), 'l' + n)}</li>); return; }
    flush();
    if (t) out.push(<p key={n}>{inline(t, 'p' + n)}</p>);
  });
  flush();
  return out;
}

export function AskPanel() {
  const ui = useUI();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { body.current?.scrollTo(0, body.current.scrollHeight); }, [turns, busy]);
  useEffect(() => { if (ui.askOpen) setTimeout(() => box.current?.focus(), 30); }, [ui.askOpen]);
  useEffect(() => {
    if (ui.askOpen && ui.askSeed && !busy) { const s = ui.askSeed; ui.clearAskSeed(); send(s); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.askOpen, ui.askSeed]);

  async function send(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setErr(''); setInput(''); setBusy(true);
    const history = turns.slice(-8);
    setTurns(t => [...t, { role: 'user', content: q }]);
    const { data, error } = await supabase.functions.invoke('ask', { body: { question: q, history } });
    setBusy(false);
    if (error || !data?.answer) {
      let msg = 'Couldn’t get an answer. Try again.';
      try { const ctx = await (error as any)?.context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* keep default */ }
      if (data?.error) msg = data.error;
      setErr(msg);
      setTurns(t => t.slice(0, -1));
      setInput(q);
      return;
    }
    setTurns(t => [...t, { role: 'assistant', content: data.answer }]);
  }

  const openContact = (id: string) => ui.openDrawer({ kind: 'contact', id });
  return (
    <aside className="chat" aria-label="Ask about your pipeline">
      <div className="chat-head"><Icon name="ask" size={14} /><strong>Ask</strong><span className="muted small">about contacts, deals and the team</span>
        <button className="icon-btn" onClick={() => ui.setAskOpen(false)} aria-label="Close Ask"><Icon name="x" size={16} /></button></div>
      <div className="chat-body" ref={body} aria-live="polite">
        {!turns.length && <>
          <p className="chat-intro">Ask anything about your contacts, deals or team.</p>
          <div className="sugg">{SUGG.map(s => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}</div>
        </>}
        {turns.map((t, i) => t.role === 'user'
          ? <div key={i} className="msg you">{t.content}</div>
          : <div key={i} className="msg bot">{render(t.content, openContact)}</div>)}
        {busy && <div className="msg bot"><p className="thinking">Thinking</p></div>}
        {err && <p className="msg-err">{err}</p>}
      </div>
      <form className="chat-form" onSubmit={e => { e.preventDefault(); send(input); }}>
        <textarea ref={box} rows={1} value={input} placeholder="Ask a question" aria-label="Your question"
          onChange={e => { setInput(e.target.value); e.target.style.height = ''; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="btn primary sm" disabled={busy}>Send</button>
      </form>
      <div className="chat-note">Answers come from the CRM data. Check anything important before acting on it.</div>
    </aside>
  );
}
