import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, configured } from './firebase';
import { friendlyError, syncProfile, type Profile } from './account-api';
import { fetchCities, fetchUserDrives } from './api';
import type { CityItem, ListingItem } from './types';
import './styles.css';

// Components
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { QuickActions } from './components/QuickActions';
import { AvailableCars } from './components/AvailableCars';
import { HowItWorks } from './components/HowItWorks';
import { WhyVMotiv } from './components/WhyVMotiv';
import { MobileAppSection } from './components/MobileAppSection';
import { AboutSection } from './components/AboutSection';
import { FAQSection } from './components/FAQSection';
import { FinalCTA } from './components/FinalCTA';
import { Footer } from './components/Footer';

// Modals
import { AuthModal } from './components/AuthModal';
import { AccountModal } from './components/AccountModal';
import { SellCarModal } from './components/SellCarModal';
import { VehicleDetailModal } from './components/VehicleDetailModal';
import { LegalModal } from './components/LegalModal';

type ConnectVehicle = { nickname: string; make?: string; model?: string; year?: number; messagingEnabled: boolean; callingEnabled: boolean };

function connectApiUrl(path: string) {
  const configured = (import.meta.env.VITE_API_BASE || 'https://api.vmotiv.in/api/v1').replace(/\/$/, '');
  const origin = configured.replace(/\/api\/v[0-9]+$/, '');
  return `${origin}/api/v2/public/connect${path}`;
}

function LegacyPublicConnectPage({ token }: { token: string }) {
  const [vehicle, setVehicle] = useState<ConnectVehicle | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('BLOCKING_ACCESS');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void fetch(connectApiUrl(`/${encodeURIComponent(token)}`))
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.active) throw new Error(body.code || 'This sticker is not active.');
        setVehicle(body.vehicle);
      })
      .catch(() => setError('This V MOTIV Connect sticker is unavailable or has been paused by its owner.'));
  }, [token]);

  const send = async (path: string, body: unknown, success: string) => {
    setBusy(true);
    try {
      const response = await fetch(connectApiUrl(`/${encodeURIComponent(token)}${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      window.alert(success);
      setMessage('');
    } catch {
      window.alert('We could not send that request. Please try again shortly.');
    } finally { setBusy(false); }
  };

  const openApp = () => {
    const deepLink = `vmotiv://connect/scan?token=${encodeURIComponent(token)}`;
    window.location.assign(deepLink);
    const ua = navigator.userAgent.toLowerCase();
    const store = ua.includes('android') ? import.meta.env.VITE_ANDROID_APP_URL : /iphone|ipad|ipod/.test(ua) ? import.meta.env.VITE_IOS_APP_URL : undefined;
    if (store) window.setTimeout(() => window.location.assign(store), 1400);
  };

  return <main className="connect-public-page"><section className="connect-public-card"><img src="../dist/brand/vmotiv-icon.png" alt="V MOTIV" className="connect-logo" /><p className="connect-kicker">V MOTIV CONNECT</p><h1>{vehicle ? vehicle.nickname : 'Secure vehicle alert'}</h1><p className="connect-lead">Send an owner a privacy-protected alert. Their name, number, and address are never displayed.</p>{error ? <p className="connect-error">{error}</p> : !vehicle ? <p className="connect-lead">Checking the secure sticker…</p> : <><div className="connect-actions"><button type="button" onClick={openApp}>Open in V MOTIV app</button><button type="button" className="connect-secondary" disabled={busy} onClick={() => void send('/call-requests', { consentGiven: true }, 'Your call request was sent to the vehicle owner. Their contact details remain private.')}>Request a private call</button></div><label htmlFor="connect-reason">What do you need to report?</label><select id="connect-reason" value={reason} onChange={event => setReason(event.target.value)}><option value="BLOCKING_ACCESS">Vehicle is blocking access</option><option value="LIGHTS_ON">Lights are left on</option><option value="DAMAGE_OR_ACCIDENT">Damage or accident concern</option><option value="SAFETY_CONCERN">Safety concern</option><option value="OTHER">Other concern</option></select><label htmlFor="connect-message">Optional message</label><textarea id="connect-message" value={message} onChange={event => setMessage(event.target.value)} maxLength={300} placeholder="Example: Your headlights appear to be on." /><button type="button" disabled={busy} onClick={() => void send('/alerts', { reason, message: message.trim() || undefined }, 'Your private alert has been sent to the owner.')}>{busy ? 'Sending…' : 'Send private alert'}</button></>}</section></main>;
}

function PublicConnectPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<'READY' | 'CALLING' | 'CONNECTED' | 'ERROR'>('READY');
  const [chat, setChat] = useState<{ from: string; text: string }[]>([]);
  const [text, setText] = useState('');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(connectApiUrl(`/${encodeURIComponent(token)}${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.code || 'REQUEST_FAILED'); return value;
  };
  const startCall = async () => {
    try {
      const realtimeUrl = import.meta.env.VITE_REALTIME_URL;
      if (!realtimeUrl) throw new Error('REALTIME_NOT_CONFIGURED');
      setPhase('CALLING'); const call = await request('/call-requests', { consentGiven: true });
      const ticket = await request(`/calls/${call.callSessionId}/realtime-ticket`);
      const socket = io(realtimeUrl, { transports: ['websocket'], auth: { ticket: ticket.ticket } }); socketRef.current = socket;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] }); peerRef.current = pc;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pc.onicecandidate = event => { if (event.candidate) socket.emit('webrtc:signal', { kind: 'ICE', payload: event.candidate.toJSON() }); };
      pc.ontrack = event => { if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play(); } };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') setPhase('CONNECTED'); };
      socket.on('webrtc:signal', async ({ message }) => { if (message?.kind === 'ANSWER') await pc.setRemoteDescription(message.payload); else if (message?.kind === 'ICE') await pc.addIceCandidate(message.payload); });
      socket.on('chat:message', item => setChat(current => [...current, { from: item.from, text: item.message?.text || '' }]));
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('webrtc:signal', { kind: 'OFFER', payload: offer });
    } catch { setPhase('ERROR'); }
  };
  const sendChat = () => { const value = text.trim(); if (!value || !socketRef.current) return; socketRef.current.emit('chat:message', { text: value }); setChat(current => [...current, { from: 'VISITOR', text: value }]); setText(''); };
  const end = () => { socketRef.current?.emit('call:hangup'); socketRef.current?.disconnect(); peerRef.current?.close(); setPhase('READY'); };
  return <main className="connect-public-page"><section className="connect-public-card"><img src="/brand/vmotiv-logo.svg" alt="V MOTIV" className="connect-logo"/><p className="connect-kicker">V MOTIV CONNECT</p><h1>Private vehicle contact</h1><p className="connect-lead">Contact the owner without seeing their number or identity.</p><audio ref={audioRef}/>{phase === 'READY' && <button type="button" onClick={() => void startCall()}>Call owner privately</button>}{phase === 'CALLING' && <p className="connect-lead">Calling securely… waiting for the owner to pick up.</p>}{phase === 'ERROR' && <><p className="connect-error">We could not start the private call. Allow microphone access and try again.</p><button type="button" onClick={() => void startCall()}>Try again</button></>}{phase === 'CONNECTED' && <><p className="connect-lead">Connected · Your number remains private</p><div className="connect-chat" aria-live="polite">{chat.map((item, index) => <p key={`${item.from}-${index}`}><strong>{item.from === 'VISITOR' ? 'You' : 'Owner'}:</strong> {item.text}</p>)}</div><label htmlFor="connect-chat-text">Private message</label><textarea id="connect-chat-text" value={text} onChange={event => setText(event.target.value)} maxLength={500}/><button type="button" onClick={sendChat}>Send message</button><button type="button" className="connect-secondary" onClick={end}>End call</button></>}</section></main>;
}

function MarketingApp() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authBusy, setAuthBusy] = useState(configured);
  const [authError, setAuthError] = useState('');
  const [cities, setCities] = useState<CityItem[]>([]);

  // Modal visibility states
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authReason, setAuthReason] = useState('');
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<ListingItem | null>(null);
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);
  const [bookedListingIds, setBookedListingIds] = useState<Set<string>>(new Set());

  // Fetch user booked test drives for live card statuses (parity with mobile app)
  const refreshUserDrives = async (currentUser: User | null) => {
    if (!currentUser) {
      setBookedListingIds(new Set());
      return;
    }
    try {
      const drives = await fetchUserDrives(currentUser);
      const requestedIds = new Set(
        drives
          .filter((d) => d.status === 'REQUESTED' || d.status === 'CONFIRMED')
          .map((d) => d.listing?.id)
          .filter(Boolean) as string[]
      );
      setBookedListingIds(requestedIds);
    } catch {
      // Ignore background error
    }
  };

  useEffect(() => {
    void refreshUserDrives(user);
  }, [user]);

  const handleDriveBooked = (listingId: string) => {
    setBookedListingIds((prev) => new Set(prev).add(listingId));
    if (user) void refreshUserDrives(user);
  };

  const handleDriveCancelled = (listingId: string) => {
    setBookedListingIds((prev) => {
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
    if (user) void refreshUserDrives(user);
  };

  const request = useRef<AbortController | null>(null);

  // Sync profile when authenticated
  async function loadProfile(current: User) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setAuthBusy(true);
    setAuthError('');
    try {
      const next = await syncProfile(current, controller.signal);
      if (!controller.signal.aborted) setProfile(next);
    } catch (failure) {
      if (!controller.signal.aborted) setAuthError(friendlyError(failure));
    } finally {
      if (!controller.signal.aborted) setAuthBusy(false);
    }
  }

  // Firebase auth state subscription
  useEffect(() => {
    if (!auth) {
      setAuthBusy(false);
      return;
    }
    const startupTimer = setTimeout(() => {
      setAuthBusy(false);
    }, 12_000);

    const stop = onIdTokenChanged(auth, (current) => {
      clearTimeout(startupTimer);
      setUser(current);
      if (current) {
        void loadProfile(current);
      } else {
        request.current?.abort();
        setProfile(null);
        setAuthBusy(false);
      }
    });

    return () => {
      clearTimeout(startupTimer);
      stop();
      request.current?.abort();
    };
  }, []);

  // Fetch supported cities for forms
  useEffect(() => {
    void fetchCities().then((res) => {
      if (res && res.length) setCities(res);
    });
  }, []);

  // Sync browser path and handle deep links / back navigation
  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      if (path === '/sell' || hash === '#sell') {
        scrollToSection('sell');
        setSellModalOpen(true);
      } else if (path === '/terms') {
        setLegalModalType('terms');
      } else if (path === '/privacy') {
        setLegalModalType('privacy');
      } else if (path === '/account') {
        if (user) {
          setAccountModalOpen(true);
        } else {
          setAuthReason('Sign in to view your V MOTIV account and activity.');
          setAuthModalOpen(true);
        }
      } else if (path === '/cars' || hash === '#cars') {
        scrollToSection('cars');
      } else if (path === '/how-it-works' || hash === '#how-it-works') {
        scrollToSection('how-it-works');
      } else if (path === '/about' || hash === '#about') {
        scrollToSection('about');
      } else if (path === '/contact' || hash === '#contact') {
        scrollToSection('contact');
      }
    };

    handleLocation();
    window.addEventListener('popstate', handleLocation);
    window.addEventListener('hashchange', handleLocation);
    return () => {
      window.removeEventListener('popstate', handleLocation);
      window.removeEventListener('hashchange', handleLocation);
    };
  }, [user]);

  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const navigateTo = (sectionId: string) => {
    scrollToSection(sectionId);
    if (sectionId === 'sell') {
      setSellModalOpen(true);
    }
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', `/#${sectionId}`);
    } else {
      window.history.replaceState({}, '', `/#${sectionId}`);
    }
  };

  // Google Login popup
  const handleLogin = async () => {
    if (!auth) {
      setAuthError('Sign-in is currently unavailable. Please verify connection.');
      return;
    }
    setAuthError('');
    setAuthBusy(true);

    let loginTimer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      loginTimer = setTimeout(() => reject({ code: 'GOOGLE_SIGN_IN_TIMEOUT' }), 120_000);
    });

    try {
      await Promise.race([
        signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver),
        deadline,
      ]);
      setAuthModalOpen(false);
    } catch (failure) {
      setAuthError(friendlyError(failure));
    } finally {
      clearTimeout(loginTimer!);
      setAuthBusy(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    if (!auth) return;
    request.current?.abort();
    setAuthBusy(true);
    try {
      await signOut(auth);
      setProfile(null);
      setUser(null);
      setAccountModalOpen(false);
      window.history.replaceState({}, '', '/');
    } catch {
      setAuthError('We could not sign you out. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleOpenAuth = (reason = '') => {
    setAuthReason(reason);
    setAuthError('');
    setAuthModalOpen(true);
  };

  return (
    <div className="site-shell">
      {/* 1. Header & Navigation */}
      <Navbar
        user={user}
        profile={profile}
        authBusy={authBusy}
        onOpenAuth={() => handleOpenAuth()}
        onOpenAccount={() => setAccountModalOpen(true)}
        onNavigate={navigateTo}
      />

      <main>
        {/* 2. Hero Section */}
        <Hero
          onExploreCars={() => navigateTo('cars')}
          onSellCar={() => navigateTo('sell')}
        />

        {/* 3. Buy / Sell Quick Action Cards */}
        <QuickActions
          onBuyClick={() => navigateTo('cars')}
          onSellClick={() => navigateTo('sell')}
        />

        {/* 4. Live Available Cars Preview */}
        <AvailableCars
          user={user}
          bookedListingIds={bookedListingIds}
          onSelectCar={(car) => setSelectedVehicle(car)}
          onSellClick={() => navigateTo('sell')}
        />

        {/* 5. How It Works (Buying & Selling Workflows) */}
        <HowItWorks />

        {/* 6. Why V MOTIV (Accountability Pillars) */}
        <WhyVMotiv />

        {/* 7. Mobile App Showcase */}
        <MobileAppSection />

        {/* 8. About V MOTIV & Presence */}
        <AboutSection />

        {/* 9. Accessible FAQ Accordion */}
        <FAQSection />

        {/* 10. Final Call to Action */}
        <FinalCTA
          onExploreCars={() => navigateTo('cars')}
          onSellCar={() => navigateTo('sell')}
        />
      </main>

      {/* 11. Footer with Official Lockup and Tagline */}
      <Footer
        onNavigate={navigateTo}
        onOpenPrivacy={() => setLegalModalType('privacy')}
        onOpenTerms={() => setLegalModalType('terms')}
      />

      {/* Modals & Dialogs */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        busy={authBusy}
        error={authError}
        actionReason={authReason}
      />

      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        user={user}
        profile={profile}
        onLogout={handleLogout}
        busy={authBusy}
      />

      <SellCarModal
        isOpen={sellModalOpen}
        onClose={() => {
          setSellModalOpen(false);
          if (window.location.pathname === '/sell' || window.location.hash === '#sell') {
            window.history.replaceState({}, '', '/');
          }
        }}
        user={user}
        cities={cities}
        onRequestAuth={(reason) => handleOpenAuth(reason)}
      />

      <VehicleDetailModal
        vehicle={selectedVehicle}
        user={user}
        onClose={() => setSelectedVehicle(null)}
        onRequestAuth={(reason) => handleOpenAuth(reason)}
        onDriveBooked={handleDriveBooked}
        onDriveCancelled={handleDriveCancelled}
      />

      <LegalModal
        isOpen={Boolean(legalModalType)}
        type={legalModalType}
        onClose={() => {
          setLegalModalType(null);
          if (window.location.pathname === '/terms' || window.location.pathname === '/privacy') {
            window.history.replaceState({}, '', '/');
          }
        }}
      />
    </div>
  );
}

function App() {
  const match = window.location.pathname.match(/^\/connect\/([A-Za-z0-9_-]{32,128})\/?$/i);
  return match ? <PublicConnectPage token={match[1]} /> : <MarketingApp />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
