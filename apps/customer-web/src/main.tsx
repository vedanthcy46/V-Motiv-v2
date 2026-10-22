import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browserPopupRedirectResolver, GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, configured } from './firebase';
import { friendlyError, syncProfile, type Profile } from './account-api';
import './styles.css';

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(configured);
  const [error, setError] = useState('');
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const request = useRef<AbortController | null>(null);
  async function load(current: User) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setProfile(null);
    try { const next = await syncProfile(current, controller.signal); if (!controller.signal.aborted) setProfile(next); }
    catch (failure) { if (!controller.signal.aborted) setError(friendlyError(failure)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  useEffect(() => {
    if (!auth) return;
    const startupTimer = setTimeout(() => { setBusy(false); setError('Restoring your Google session took too long. Please try signing in again.'); }, 15_000);
    const stop = onIdTokenChanged(auth, current => {
      clearTimeout(startupTimer);
      setUser(current);
      if (current) void load(current);
      else { request.current?.abort(); setProfile(null); setBusy(false); }
    });
    return () => { clearTimeout(startupTimer); stop(); request.current?.abort(); };
  }, []);
  async function login() {
    if (!auth) return;
    setError(''); setBusy(true);
    setConnectingGoogle(true);
    let loginTimer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => { loginTimer = setTimeout(() => reject({ code: 'GOOGLE_SIGN_IN_TIMEOUT' }), 120_000); });
    try { await Promise.race([signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver), deadline]); }
    catch (failure) { setError(friendlyError(failure)); setBusy(false); }
    finally { clearTimeout(loginTimer!); setConnectingGoogle(false); }
  }
  async function logout() {
    if (!auth) return;
    request.current?.abort();
    setBusy(true);
    try { await signOut(auth); setError(''); }
    catch { setError('We could not sign you out. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="shell">
    <header><a className="wordmark" href="/" aria-label="V MOTIV home">V <span>MOTIV</span><small>YOUR NEXT CHAPTER</small></a><span className="header-note">Customer account</span></header>
    <main>
      <section className="intro"><p className="eyebrow">A BETTER WAY FORWARD</p><h1>Your car journey.<br/><span>One account.</span></h1><p className="lead">A place for every step of buying and selling your car.</p><div className="journey"><span>Explore possibilities</span><span>Make your next move</span><span>Stay connected</span></div></section>
      <section className="card" aria-labelledby="account-title" aria-busy={busy}>
        <span className="section-label">{profile ? 'YOUR ACCOUNT' : 'LET’S GET STARTED'}</span>
        <h2 id="account-title">{profile ? 'Welcome, ' + (profile.displayName?.split(' ')[0] || 'there') : 'Welcome to V MOTIV'}</h2>
        <p className="card-description">{profile ? 'You’re signed in and your account is ready.' : 'Use your Google account to sign in or create your V MOTIV account.'}</p>
        {!configured && <p className="notice" role="status">Google sign-in is being configured. Please check back shortly.</p>}
        {busy && <p role="status" className="notice">{connectingGoogle ? 'Complete sign-in in the Google window…' : 'Connecting to your account…'}</p>}
        {error && <div role="alert" className="error"><p>{error}</p>{user && <button className="secondary" disabled={busy} onClick={() => void load(user)}>Try again</button>}</div>}
        {profile && <dl><div><dt>Email address</dt><dd>{profile.email}</dd></div><div><dt>Member since</dt><dd>{new Date(profile.createdAt).toLocaleDateString()}</dd></div><div><dt>Marketing emails</dt><dd>{profile.marketingConsent ? 'Subscribed' : 'Not subscribed'}</dd></div></dl>}
        {!user ? <button className="google" disabled={!configured || busy} onClick={() => void login()}><span aria-hidden="true" className="google-letter">G</span>Continue with Google<span aria-hidden="true">→</span></button> : <button className="secondary" disabled={busy} onClick={() => void logout()}>Sign out</button>}
        <p className="fine-print">Your Google account helps keep sign-in simple. We won’t subscribe you to promotional emails when you join.</p>
      </section>
    </main>
    <footer><span>V MOTIV</span><p>Move forward with confidence.</p></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

