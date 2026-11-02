import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Shell from './components/Shell';
import { StoreProvider } from './lib/store';
import { configured, supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import { UIProvider } from './lib/ui';
import Login from './pages/Login';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(session === null ? null : undefined); return; }
    setProfile(undefined);
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => setProfile(data || null));
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!configured) {
    return <div className="center-note"><h1>Supabase isn’t connected</h1>
      <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the Netlify environment variables, then redeploy.</p></div>;
  }
  if (session === undefined || (session && profile === undefined)) return <div className="loading"><span className="spin" /></div>;
  if (!session) return <Login />;
  if (!profile || !profile.active) {
    return <div className="center-note"><h1>{profile ? 'Your access was removed' : 'No access yet'}</h1>
      <p>{profile ? 'Ask an admin if you think this is a mistake.' : 'Your account isn’t on the team. Ask your manager for an invite.'}</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button></div>;
  }
  return (
    <UIProvider>
      <StoreProvider me={profile}>
        <Shell />
      </StoreProvider>
    </UIProvider>
  );
}
