import Papa from 'papaparse';
import { useState } from 'react';
import { cleanText, guessTimezone, isEmail, TIMEZONES } from '../lib/format';
import { useStore } from '../lib/store';
import { friendlyError, supabase } from '../lib/supabase';
import { SOURCES } from '../lib/types';
import { useUI } from '../lib/ui';
import { Modal } from './bits';

const FIELDS = [
  ['full_name', 'Name', /^(full ?name|name|contact|contact name|lead|lead name)$/i],
  ['first_name', 'First name', /^first ?name$/i],
  ['last_name', 'Last name', /^(last ?name|surname)$/i],
  ['company', 'Business', /^(business|company|business name|company name|organisation|organization)$/i],
  ['email', 'Email', /e-?mail/i],
  ['phone', 'Phone', /(phone|mobile|cell|number)/i],
  ['city', 'City or state', /^(city|location|suburb|state|town|region)$/i],
  ['source', 'Source', /^(source|lead source|channel)$/i],
  ['tags', 'Tags', /^(tags?|labels?)$/i],
  ['value', 'Deal value', /(value|amount|price|deal size|revenue)/i],
  ['stage', 'Stage', /^(stage|status|deal stage)$/i],
  ['owner', 'Owner email or name', /^(owner|rep|assigned|assigned to|setter|closer)$/i],
  ['next_step', 'Next step', /^(next ?step|next action|notes?)$/i]
] as const;
type FieldKey = (typeof FIELDS)[number][0];

export function ImportModal() {
  const store = useStore();
  const ui = useUI();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<FieldKey, string>>>({});
  const [pipeline, setPipeline] = useState(store.pipelines[0]?.id || '');
  const [owner, setOwner] = useState(store.me.id);
  const [tz, setTz] = useState('America/New_York');
  const [source, setSource] = useState('Import');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  function onFile(file: File | undefined) {
    if (!file) return;
    setErr('');
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: res => {
        const hs = (res.meta.fields || []).filter(Boolean);
        if (!hs.length || !res.data.length) return setErr('That file has no rows. Check it’s a CSV with a header row.');
        if (res.data.length > 5000) return setErr('Import up to 5,000 rows at a time.');
        const m: Partial<Record<FieldKey, string>> = {};
        FIELDS.forEach(([k, , re]) => { const h = hs.find(x => re.test(x.trim())); if (h && !Object.values(m).includes(h)) m[k] = h; });
        setHeaders(hs); setRows(res.data); setMap(m);
      },
      error: e => setErr(e.message)
    });
  }

  const get = (r: Record<string, string>, k: FieldKey) => (map[k] ? String(r[map[k]!] ?? '').trim() : '');
  const nameOf = (r: Record<string, string>) => get(r, 'full_name') || [get(r, 'first_name'), get(r, 'last_name')].filter(Boolean).join(' ');
  const existing = new Set(store.contacts.map(c => (c.email || '').toLowerCase()).filter(Boolean));
  const seen = new Set<string>();
  const plan = rows.map(r => {
    const name = cleanText(nameOf(r), 120);
    const email = get(r, 'email').toLowerCase();
    let skip = '';
    if (!name) skip = 'no name';
    else if (email && !isEmail(email)) skip = 'bad email';
    else if (email && existing.has(email)) skip = 'already in CRM';
    else if (email && seen.has(email)) skip = 'duplicate in file';
    if (email) seen.add(email);
    return { r, name, email, skip };
  });
  const good = plan.filter(p => !p.skip);

  async function submit() {
    if (!rows.length) return setErr('Choose a CSV file first.');
    if (!map.full_name && !map.first_name) return setErr('Match a column to Name or First name.');
    const stages = store.pipelineStages(pipeline);
    const first = stages.find(s => s.kind === 'open');
    if (!first) return setErr('That pipeline has no open stages.');
    if (!good.length) return setErr('Nothing to import. Every row was skipped.');
    setBusy(true); setErr('');
    const people = store.profiles.filter(p => p.active);
    const ownerFor = (v: string) => {
      const x = v.toLowerCase();
      return x ? people.find(p => p.email === x || p.full_name.toLowerCase() === x || p.full_name.toLowerCase().split(' ')[0] === x)?.id || owner : owner;
    };
    let done = 0;
    for (let i = 0; i < good.length; i += 200) {
      const chunk = good.slice(i, i + 200);
      const contacts = chunk.map(({ r, name, email }) => {
        const city = cleanText(get(r, 'city'), 80);
        const src = get(r, 'source');
        return {
          full_name: name, company: cleanText(get(r, 'company'), 120), email: email || null, phone: get(r, 'phone').slice(0, 40),
          city, timezone: guessTimezone(city, tz), source: SOURCES.find(s => s.toLowerCase() === src.toLowerCase()) || src.slice(0, 40) || source,
          tags: [...new Set(get(r, 'tags').split(/[,;|]/).map(t => cleanText(t, 24)).filter(Boolean))],
          owner_id: ownerFor(get(r, 'owner')), created_by: store.me.id
        };
      });
      const { data: made, error } = await supabase.from('contacts').insert(contacts).select();
      if (error || !made) { setBusy(false); setProgress(''); return setErr(`Stopped after ${done} contacts. ${friendlyError(error?.message)}`); }
      made.forEach(c => store.put('contacts', c));
      const deals = made.map((c, j) => {
        const r = chunk[j].r;
        const st = stages.find(s => s.name.toLowerCase() === get(r, 'stage').toLowerCase()) || first;
        const value = parseFloat(get(r, 'value').replace(/[^\d.]/g, '')) || 0;
        const next = get(r, 'next_step').slice(0, 200);
        return { contact_id: c.id, pipeline_id: pipeline, stage_id: st.id, value, owner_id: c.owner_id, next_step: next, created_by: store.me.id };
      });
      const d = await supabase.from('deals').insert(deals).select();
      (d.data || []).forEach(x => store.put('deals', x));
      await supabase.from('activities').insert(made.map(c => ({ contact_id: c.id, type: 'import', body: 'Imported from CSV', created_by: store.me.id })));
      done += made.length;
      setProgress(`Imported ${done} of ${good.length}`);
    }
    await supabase.from('audit_log').insert({ actor_id: store.me.id, action: 'import', detail: `${store.me.full_name} imported ${done} contacts` });
    setBusy(false);
    ui.closeModal();
    ui.toast(`Imported ${done} contacts`);
  }

  const skipped = plan.length - good.length;
  return (
    <Modal title="Import contacts from CSV" submit={rows.length ? `Import ${good.length}` : 'Import'} onSubmit={submit} error={err} busy={busy}>
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} /></label>
      <p className="m-sub small">Export the sales spreadsheet as CSV. The first row must be the column names. Each row becomes a contact with one deal.</p>
      {rows.length > 0 && <>
        <div className="map-grid">
          {FIELDS.map(([k, label]) => <div key={k} style={{ display: 'contents' }}>
            <span>{label}</span>
            <select value={map[k] || ''} onChange={e => setMap(m => ({ ...m, [k]: e.target.value || undefined }))} aria-label={'Column for ' + label}>
              <option value="">Not in file</option>{headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select></div>)}
        </div>
        <div className="row2">
          <label>Pipeline<select value={pipeline} onChange={e => setPipeline(e.target.value)}>{store.pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Default owner<select value={owner} onChange={e => setOwner(e.target.value)}>{store.profiles.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        </div>
        <div className="row2">
          <label>Default time zone<select value={tz} onChange={e => setTz(e.target.value)}>{TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Default source<select value={source} onChange={e => setSource(e.target.value)}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></label>
        </div>
        <p className="m-sub">{good.length} ready to import{skipped ? `, ${skipped} skipped (${[...new Set(plan.filter(p => p.skip).map(p => p.skip))].join(', ')})` : ''}. Stages that don’t match go into {store.pipelineStages(pipeline).find(s => s.kind === 'open')?.name}.</p>
        {progress && <p className="m-sub">{progress}</p>}
      </>}
    </Modal>
  );
}
