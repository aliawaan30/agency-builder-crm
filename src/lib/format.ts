const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export const dayDiff = (d: string | Date) => Math.round((startOfDay(new Date(d)).getTime() - startOfDay(new Date()).getTime()) / 864e5);
export const tm = (d: string | Date) => new Date(d).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
export const money = (v: number) => '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const short = (v: number) => (v >= 1000 ? '$' + +(v / 1000).toFixed(1) + 'k' : '$' + Math.round(v || 0));
export const initials = (n: string) => n.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
export const firstName = (n: string) => n.split(' ')[0] || n;
export const cleanText = (v: string, max = 40) => String(v).replace(/[<>"]/g, '').trim().slice(0, max);
export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export function fmtDue(d: string | null): string {
  if (!d) return 'No next step';
  const n = dayDiff(d);
  if (n < 0) return -n + (n === -1 ? ' day' : ' days') + ' overdue';
  if (n === 0) return 'Today ' + tm(d);
  if (n === 1) return 'Tomorrow ' + tm(d);
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtAgo(d: string): string {
  const n = dayDiff(d);
  return n === 0 ? 'today' : n === -1 ? 'yesterday' : n < 0 ? -n + ' days ago' : 'in ' + n + ' days';
}
export function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function theirTime(tz: string) {
  const now = new Date();
  try {
    const p: Record<string, string> = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(now).forEach(x => { p[x.type] = x.value; });
    const h = +p.hour % 24, weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
    const time = now.toLocaleTimeString('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const ok = !weekend && h >= 9 && h < 19;
    return { time, ok, label: ok ? 'Good time to call' : weekend ? 'Weekend there' : h < 9 ? 'Too early there' : 'After hours there' };
  } catch {
    return { time: '', ok: false, label: 'Unknown time zone' };
  }
}

// datetime-local input value from an ISO string, and back.
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
export const daysFromNow = (days: number, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

const HUES = ['#2D4FC4', '#1F7A4E', '#B7791F', '#B4433A', '#7A3FB8', '#0F7C86', '#A23E7A'];
export function hue(t: string): string {
  let h = 0;
  for (const ch of String(t).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export const TIMEZONES: [string, string][] = [
  ['Australia/Sydney', 'Sydney, Melbourne, Canberra'],
  ['Australia/Brisbane', 'Brisbane, Gold Coast'],
  ['Australia/Adelaide', 'Adelaide'],
  ['Australia/Perth', 'Perth'],
  ['Australia/Darwin', 'Darwin'],
  ['Australia/Hobart', 'Hobart'],
  ['Pacific/Auckland', 'New Zealand'],
  ['America/New_York', 'US Eastern'],
  ['America/Chicago', 'US Central'],
  ['America/Denver', 'US Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'US Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Toronto', 'Toronto'],
  ['America/Vancouver', 'Vancouver'],
  ['Europe/London', 'United Kingdom'],
  ['Asia/Karachi', 'Pakistan']
];

// Best guess of a time zone from a city or state, used by the CSV import.
const CITY_HINTS: [RegExp, string][] = [
  [/sydney|nsw|melbourne|vic\b|victoria|canberra|act\b/i, 'Australia/Sydney'],
  [/brisbane|gold coast|qld|queensland|sunshine coast/i, 'Australia/Brisbane'],
  [/adelaide|\bsa\b|south australia/i, 'Australia/Adelaide'],
  [/perth|\bwa\b|western australia/i, 'Australia/Perth'],
  [/hobart|tasmania|tas\b/i, 'Australia/Hobart'],
  [/darwin|\bnt\b/i, 'Australia/Darwin'],
  [/auckland|wellington|new zealand|\bnz\b/i, 'Pacific/Auckland'],
  [/phoenix|arizona|\baz\b/i, 'America/Phoenix'],
  [/los angeles|san diego|san francisco|seattle|portland|las vegas|\bca\b|california|\bwa\b|\bor\b|\bnv\b/i, 'America/Los_Angeles'],
  [/denver|colorado|\bco\b|utah|salt lake/i, 'America/Denver'],
  [/chicago|texas|\btx\b|austin|houston|dallas|nashville|\btn\b|\bil\b|minnesota|missouri/i, 'America/Chicago'],
  [/new york|\bny\b|florida|\bfl\b|miami|tampa|atlanta|\bga\b|boston|\bma\b|\bnj\b|philadelphia/i, 'America/New_York'],
  [/london|\buk\b|united kingdom|england/i, 'Europe/London']
];
export function guessTimezone(city: string, fallback: string): string {
  for (const [re, tz] of CITY_HINTS) if (re.test(city)) return tz;
  return fallback;
}
