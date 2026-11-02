import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/bits';
import { isEmail } from '../lib/format';
import { friendlyError, supabase } from '../lib/supabase';

const G = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
);

export default function Login() {
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Errors from a Google redirect come back in the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''));
    const desc = p.get('error_description');
    if (desc) {
      setErr(friendlyError(desc.replace(/\+/g, ' ')));
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  async function google() {
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
    });
    if (error) { setBusy(false); setErr(friendlyError(error.message)); }
  }
  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const v = email.trim().toLowerCase();
    if (!isEmail(v)) return setErr('Enter a valid email address.');
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: v, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setErr(friendlyError(error.message));
    setEmail(v); setStep('code');
  }

  return (
    <section className="auth">
      <div className="logo"><span className="mark">AB</span>Agency Builder CRM</div>
      <div className="auth-card">
        {step === 'start' ? <>
          <h1>Sign in</h1>
          <p className="sub">Welcome back. Use your work account.</p>
          <button className="gbtn" type="button" onClick={google} disabled={busy}>{G}Continue with Google</button>
          <div className="or">or use email</div>
          <form onSubmit={sendCode} noValidate>
            <label className="flabel" htmlFor="em">Work email</label>
            <input id="em" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
            {err && <p className="err">{err}</p>}
            <button className="btn primary lg" disabled={busy}>{busy ? 'Sending' : 'Email me a code'}</button>
          </form>
        </> : <CodeStep email={email} onBack={() => { setStep('start'); setErr(''); }} onResend={() => sendCode()} />}
      </div>
      <div className="auth-legal"><span>Invite only. Ask your manager for access.</span></div>
    </section>
  );
}

function CodeStep({ email, onBack, onResend }: { email: string; onBack: () => void; onResend: () => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(30);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft(l => l - 1), 1000); return () => clearTimeout(t); }, [left]);

  async function verify(code: string) {
    if (busy) return;
    setBusy(true); setErr('');
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (error) { setErr(friendlyError(error.message)); setDigits(['', '', '', '', '', '']); refs.current[0]?.focus(); }
  }
  function setAt(i: number, v: string) {
    const d = v.replace(/\D/g, '');
    const next = [...digits];
    if (d.length > 1) { d.slice(0, 6).split('').forEach((c, j) => { if (j < 6) next[j] = c; }); }
    else next[i] = d;
    setDigits(next);
    const code = next.join('');
    if (code.length === 6) verify(code);
    else if (d && i < 5) refs.current[Math.min(d.length > 1 ? d.length : i + 1, 5)]?.focus();
  }
  return <>
    <button className="linkbtn back" type="button" onClick={onBack}><Icon name="left" size={14} />Back</button>
    <h1>Check your email</h1>
    <p className="sub">We sent a 6 digit code to <strong>{email}</strong>. It expires soon.</p>
    <div className={'otp' + (err ? ' bad' : '')}>
      {digits.map((d, i) => <span key={i} style={{ display: 'contents' }}>
        {i === 3 && <span className="gap" />}
        <input ref={el => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} value={d} aria-label={'Digit ' + (i + 1)} disabled={busy}
          onChange={e => setAt(i, e.target.value)} onKeyDown={e => { if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }} />
      </span>)}
    </div>
    {err && <p className="err">{err}</p>}
    {busy && <p className="ok-state"><span className="spin" /> Checking</p>}
    <p className="fine">Didn’t get it? Check spam, or <button className="linkbtn" type="button" disabled={left > 0} onClick={() => { onResend(); setLeft(30); }}>{left > 0 ? `resend in ${left}s` : 'resend the code'}</button></p>
  </>;
}
