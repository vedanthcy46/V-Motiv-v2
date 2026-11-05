import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Toaster, initTheme, RequestProgress } from '@vmotiv/ui';
import './styles.css';

initTheme();

// Components
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { QuickActions } from './components/QuickActions';
import { HowItWorks } from './components/HowItWorks';
import { WhyVMotiv } from './components/WhyVMotiv';
import { MobileAppSection } from './components/MobileAppSection';
import { AboutSection } from './components/AboutSection';
import { FAQSection } from './components/FAQSection';
import { FinalCTA } from './components/FinalCTA';
import { Footer } from './components/Footer';
import { LegalModal } from './components/LegalModal';

type ConnectVehicle = { nickname: string; make?: string; model?: string; year?: number; messagingEnabled: boolean; callingEnabled: boolean };

function connectApiUrl(path: string) {
  const configured = (import.meta.env.VITE_API_BASE || 'https://api.vmotiv.in/api/v1').replace(/\/$/, '');
  const origin = configured.replace(/\/api\/v[0-9]+$/, '');
  return `${origin}/api/v2/public/connect${path}`;
}

const QUICK_CONCERN_CHIPS = [
  'Vehicle is blocking access / driveway',
  'Headlights or parking lights left on',
  'Window open or car alarm sounding',
  'Scratch or parking damage concern',
  'Minor emergency / urgent attention',
];

function PublicConnectPage({ token }: { token: string }) {
  const [vehicle, setVehicle] = useState<ConnectVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'chat' | 'call'>('chat');

  // Chat State
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderRole: 'VISITOR' | 'OWNER'; text: string; time: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [selectedChip, setSelectedChip] = useState('');

  // Call State
  const [callPhase, setCallPhase] = useState<'READY' | 'CALLING' | 'CONNECTED' | 'DECLINED' | 'ERROR'>('READY');
  const [callDuration, setCallDuration] = useState(0);

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatSessionIdRef = useRef<string | null>(null);
  const callDurationTimerRef = useRef<number | null>(null);
  const voicePollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    chatSessionIdRef.current = chatSessionId;
  }, [chatSessionId]);

  useEffect(() => {
    let unmounted = false;
    setLoading(true);
    void fetch(connectApiUrl(`/${encodeURIComponent(token)}`))
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.active) throw new Error(data.code || 'This sticker is not active.');
        if (!unmounted) {
          setVehicle(data.vehicle);
          setError('');
        }
      })
      .catch(() => {
        if (!unmounted) {
          setError('This V MOTIV Connect sticker is inactive or has been paused by the vehicle owner.');
        }
      })
      .finally(() => {
        if (!unmounted) setLoading(false);
      });
    return () => {
      unmounted = true;
    };
  }, [token]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const request = async (path: string, body?: unknown) => {
    const response = await fetch(connectApiUrl(`/${encodeURIComponent(token)}${path}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.code || 'REQUEST_FAILED');
    return value;
  };

  const getRealtimeUrl = () => {
    const apiOrigin = (import.meta.env.VITE_API_BASE || 'https://api.vmotiv.in/api/v1')
      .replace(/\/$/, '')
      .replace(/\/api\/v[0-9]+$/, '');
    return import.meta.env.VITE_REALTIME_URL || apiOrigin;
  };

  useEffect(() => {
    if (!chatSessionId || isClosed) return;
    const interval = window.setInterval(async () => {
      const activeId = chatSessionIdRef.current;
      if (!activeId) return;
      try {
        const res = await fetch(connectApiUrl(`/${encodeURIComponent(token)}/calls/${activeId}/signals`));
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'CLOSED' || data.status === 'DECLINED') {
          setIsClosed(true);
        }
        if (Array.isArray(data.items)) {
          const chatItems = data.items.filter((s: any) => s.kind === 'CHAT' && s.payload?.text);
          if (chatItems.length > 0) {
            setChatMessages(
              chatItems.map((s: any) => ({
                id: s.id,
                senderRole: s.senderRole === 'VISITOR' ? 'VISITOR' : 'OWNER',
                text: String(s.payload.text),
                time: new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }))
            );
          }
          if (data.items.some((s: any) => s.kind === 'CLOSE' || s.kind === 'HANGUP')) {
            setIsClosed(true);
          }
        }
      } catch {
        // Non-fatal polling error
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [token, chatSessionId, isClosed]);

  const connectChatSocket = async (sessionId: string) => {
    try {
      const ticket = await request(`/calls/${sessionId}/realtime-ticket`);
      const realtimeUrl = getRealtimeUrl();
      const socket = io(realtimeUrl, {
        transports: ['websocket', 'polling'],
        auth: { ticket: ticket.ticket },
      });
      socketRef.current = socket;

      socket.on('chat:message', (data: any) => {
        const text = data?.text || data?.message?.text;
        if (!text) return;
        setChatMessages(prev => {
          if (prev.some(m => m.text === text && m.senderRole === (data.from === 'OWNER' ? 'OWNER' : 'VISITOR'))) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `msg-${Date.now()}-${Math.random()}`,
              senderRole: data.from === 'OWNER' ? 'OWNER' : 'VISITOR',
              text: String(text),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ];
        });
      });

      socket.on('webrtc:signal', (signal: any) => {
        if (signal?.kind === 'CLOSE' || signal?.kind === 'HANGUP') {
          setIsClosed(true);
        }
      });

      socket.on('call:closed', () => setIsClosed(true));
      socket.on('call:declined', () => setIsClosed(true));
      socket.on('call:hangup', () => setIsClosed(true));
    } catch {
      // Polling fallback active
    }
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isSending || isClosed) return;

    setIsSending(true);
    setInputText('');
    setSelectedChip('');

    try {
      if (!chatSessionId) {
        const call = await request('/call-requests', {
          consentGiven: true,
          mode: 'CHAT',
          initialMessage: text,
        });
        setChatSessionId(call.callSessionId);
        chatSessionIdRef.current = call.callSessionId;
        setChatMessages([
          {
            id: `init-${Date.now()}`,
            senderRole: 'VISITOR',
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        void connectChatSocket(call.callSessionId);
      } else {
        await request(`/calls/${chatSessionId}/signals`, {
          kind: 'CHAT',
          payload: { text, from: 'VISITOR' },
        });
        if (socketRef.current?.connected) {
          socketRef.current.emit('chat:message', { text });
        }
        setChatMessages(prev => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            senderRole: 'VISITOR',
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch {
      window.alert('Unable to send message right now. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectChip = (chip: string) => {
    setSelectedChip(chip);
    setInputText(chip);
  };

  const cleanupCall = () => {
    if (callDurationTimerRef.current) {
      clearInterval(callDurationTimerRef.current);
      callDurationTimerRef.current = null;
    }
    if (voicePollTimerRef.current) {
      clearInterval(voicePollTimerRef.current);
      voicePollTimerRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
  };

  const startVoiceCall = async () => {
    cleanupCall();
    try {
      setCallPhase('CALLING');
      setCallDuration(0);

      const call = await request('/call-requests', { consentGiven: true, mode: 'VOICE' });
      const ticket = await request(`/calls/${call.callSessionId}/realtime-ticket`);
      const realtimeUrl = getRealtimeUrl();
      const socket = io(realtimeUrl, {
        transports: ['websocket', 'polling'],
        auth: { ticket: ticket.ticket },
      });
      socketRef.current = socket;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
      });
      peerRef.current = pc;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = event => {
        if (event.candidate) {
          const payload = event.candidate.toJSON();
          socket.emit('webrtc:signal', { kind: 'ICE', payload });
          void request(`/calls/${call.callSessionId}/signals`, { kind: 'ICE', payload }).catch(() => undefined);
        }
      };

      pc.ontrack = event => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          void audioRef.current.play().catch(() => undefined);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallPhase('CONNECTED');
          if (!callDurationTimerRef.current) {
            callDurationTimerRef.current = window.setInterval(() => {
              setCallDuration(prev => prev + 1);
            }, 1000);
          }
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setCallPhase('DECLINED');
          cleanupCall();
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setCallPhase('CONNECTED');
          if (!callDurationTimerRef.current) {
            callDurationTimerRef.current = window.setInterval(() => {
              setCallDuration(prev => prev + 1);
            }, 1000);
          }
        }
      };

      const pendingIceCandidates: RTCIceCandidateInit[] = [];

      const flushPendingIce = async () => {
        while (pendingIceCandidates.length > 0) {
          const cand = pendingIceCandidates.shift();
          if (cand && pc.signalingState !== 'closed') {
            try {
              await pc.addIceCandidate(cand);
            } catch {
              // Ignore invalid or stale candidate
            }
          }
        }
      };

      const resendOffer = () => {
        if (pc.localDescription && pc.signalingState !== 'closed' && pc.connectionState !== 'connected') {
          const offerPayload = { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
          socket.emit('webrtc:signal', { kind: 'OFFER', payload: offerPayload });
          void request(`/calls/${call.callSessionId}/signals`, { kind: 'OFFER', payload: offerPayload }).catch(() => undefined);
        }
      };

      socket.on('peer:joined', ({ from }) => {
        if (from === 'OWNER') resendOffer();
      });

      socket.on('call:ready', () => {
        resendOffer();
      });

      socket.on('webrtc:signal', async ({ message }) => {
        if (message?.kind === 'ANSWER' && pc.signalingState !== 'closed') {
          await pc.setRemoteDescription(message.payload);
          await flushPendingIce();
        } else if (message?.kind === 'ICE' && message.payload && pc.signalingState !== 'closed') {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(message.payload).catch(() => undefined);
          } else {
            pendingIceCandidates.push(message.payload);
          }
        } else if (message?.kind === 'HANGUP' || message?.kind === 'CLOSE') {
          setCallPhase('DECLINED');
          cleanupCall();
        }
      });

      socket.on('call:declined', () => {
        setCallPhase('DECLINED');
        cleanupCall();
      });

      socket.on('call:hangup', () => {
        setCallPhase('DECLINED');
        cleanupCall();
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const offerPayload = { type: offer.type, sdp: offer.sdp };
      socket.emit('webrtc:signal', { kind: 'OFFER', payload: offerPayload });
      // Persist the initiating offer before displaying the ringing state. A
      // Vercel deployment may not have a resident Socket.IO process, whereas
      // the durable signal API is always available to the owner app.
      await request(`/calls/${call.callSessionId}/signals`, { kind: 'OFFER', payload: offerPayload });

      // HTTP Polling fallback for voice signals
      const handledSignalIds = new Set<string>();
      const pollTimer = window.setInterval(async () => {
        if (!peerRef.current || peerRef.current.signalingState === 'closed') return;
        try {
          const res = await fetch(connectApiUrl(`/${encodeURIComponent(token)}/calls/${call.callSessionId}/signals`));
          const data = await res.json().catch(() => ({}));
          if (Array.isArray(data.items)) {
            for (const sig of data.items) {
              if (handledSignalIds.has(sig.id)) continue;
              handledSignalIds.add(sig.id);
              if (sig.senderRole !== 'OWNER') continue;
              if (sig.kind === 'ANSWER' && pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(sig.payload));
                await flushPendingIce();
              } else if (sig.kind === 'ICE' && sig.payload && pc.signalingState !== 'closed') {
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(new RTCIceCandidate(sig.payload)).catch(() => undefined);
                } else {
                  pendingIceCandidates.push(sig.payload);
                }
              } else if (sig.kind === 'HANGUP' || sig.kind === 'CLOSE') {
                setCallPhase('DECLINED');
                cleanupCall();
              }
            }
          }
        } catch {
          // Poll fallback non-fatal
        }
      }, 1500);
      voicePollTimerRef.current = pollTimer;
    } catch {
      setCallPhase('ERROR');
      cleanupCall();
    }
  };

  const endVoiceCall = () => {
    socketRef.current?.emit('call:hangup');
    cleanupCall();
    setCallPhase('READY');
  };

  const openApp = () => {
    const deepLink = `vmotiv://connect/scan?token=${encodeURIComponent(token)}`;
    window.location.assign(deepLink);
    const ua = navigator.userAgent.toLowerCase();
    const store = ua.includes('android')
      ? import.meta.env.VITE_ANDROID_APP_URL
      : /iphone|ipad|ipod/.test(ua)
      ? import.meta.env.VITE_IOS_APP_URL
      : undefined;
    if (store) window.setTimeout(() => window.location.assign(store), 1400);
  };

  const formatDuration = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <main className="connect-public-page">
      <section className="connect-public-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <img src="/brand/vmotiv-icon.png" alt="V MOTIV" className="connect-logo" />
          <div className="connect-vehicle-badge">
            <span>🛡️ Verified Connect Sticker</span>
          </div>
        </div>

        <p className="connect-kicker">V MOTIV CONNECT</p>
        <h1>{vehicle ? vehicle.nickname : 'Secure Vehicle Contact'}</h1>
        <p className="connect-lead">
          Contact the vehicle owner without seeing their personal phone number or identity.
        </p>

        {loading ? (
          <p className="connect-lead">Connecting securely to vehicle sticker…</p>
        ) : error ? (
          <p className="connect-error">{error}</p>
        ) : (
          <>
            {/* Communication Tabs */}
            <div className="connect-tabs">
              <button
                type="button"
                className={`connect-tab-btn ${tab === 'chat' ? 'active' : ''}`}
                onClick={() => setTab('chat')}
              >
                💬 Chat with Owner
              </button>
              <button
                type="button"
                className={`connect-tab-btn ${tab === 'call' ? 'active' : ''}`}
                onClick={() => setTab('call')}
              >
                📞 Call Privately
              </button>
            </div>

            {/* TAB: CHAT */}
            {tab === 'chat' && (
              <div style={{ display: 'grid', gap: '10px' }}>
                {isClosed ? (
                  <div className="connect-status-banner resolved">
                    <span>✅ The vehicle owner has resolved this issue and closed the conversation. Thank you!</span>
                  </div>
                ) : chatSessionId ? (
                  <div className="connect-status-banner waiting">
                    <span>🟢 Connected · The owner receives alerts with sound and can reply here in real time.</span>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px' }}>Quick concerns:</label>
                    <div className="connect-quick-chips">
                      {QUICK_CONCERN_CHIPS.map(chip => (
                        <button
                          key={chip}
                          type="button"
                          className={`connect-chip ${selectedChip === chip ? 'active' : ''}`}
                          onClick={() => handleSelectChip(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message thread */}
                {chatMessages.length > 0 && (
                  <div className="connect-chat-thread" aria-live="polite">
                    {chatMessages.map(msg => (
                      <div
                        key={msg.id}
                        className={`connect-chat-bubble ${msg.senderRole === 'VISITOR' ? 'visitor' : 'owner'}`}
                      >
                        <div className="connect-chat-sender">
                          {msg.senderRole === 'VISITOR' ? 'You' : 'Owner'} · {msg.time}
                        </div>
                        <div>{msg.text}</div>
                      </div>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>
                )}

                {/* Input area */}
                {!isClosed ? (
                  <form onSubmit={handleSendChat} style={{ display: 'grid', gap: '8px' }}>
                    <label htmlFor="connect-chat-input">
                      {chatSessionId ? 'Send reply' : 'Message to owner'}
                    </label>
                    <textarea
                      id="connect-chat-input"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      maxLength={500}
                      placeholder="e.g., Hi, your car is blocking our driveway, could you please move it?"
                      disabled={isSending}
                    />
                    <button type="submit" disabled={isSending || !inputText.trim()}>
                      {isSending ? 'Sending…' : chatSessionId ? 'Send Reply' : 'Send Private Message'}
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="connect-secondary"
                    onClick={() => {
                      setChatSessionId(null);
                      setChatMessages([]);
                      setIsClosed(false);
                    }}
                  >
                    Start a New Message
                  </button>
                )}
              </div>
            )}

            {/* TAB: CALL */}
            {tab === 'call' && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <audio ref={audioRef} autoPlay playsInline />

                {callPhase === 'READY' && (
                  <>
                    <p className="connect-lead">
                      Start a private voice call directly from your browser. The owner's phone will ring immediately with a high-priority sound alert.
                    </p>
                    <button type="button" onClick={() => void startVoiceCall()}>
                      Start Private Voice Call
                    </button>
                  </>
                )}

                {callPhase === 'CALLING' && (
                  <div className="connect-call-calling">
                    <div className="connect-pulse-circle">
                      <span style={{ fontSize: '26px' }}>📞</span>
                    </div>
                    <p style={{ fontWeight: 700, margin: 0 }}>Calling securely…</p>
                    <p className="connect-lead" style={{ margin: 0, fontSize: '13px' }}>
                      Waiting for the owner to pick up. Their phone is ringing.
                    </p>
                    <button type="button" className="connect-secondary" onClick={endVoiceCall} style={{ marginTop: '10px' }}>
                      Cancel Call
                    </button>
                  </div>
                )}

                {callPhase === 'CONNECTED' && (
                  <div className="connect-call-calling">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 800 }}>
                      <span>🟢 Connected</span>
                      <span>•</span>
                      <span>{formatDuration(callDuration)}</span>
                    </div>
                    <p className="connect-lead" style={{ margin: 0, fontSize: '13px' }}>
                      Private voice call in progress. Audio is encrypted.
                    </p>
                    <button type="button" className="connect-secondary" onClick={endVoiceCall} style={{ marginTop: '10px' }}>
                      End Call
                    </button>
                  </div>
                )}

                {callPhase === 'DECLINED' && (
                  <div style={{ display: 'grid', gap: '8px', textAlign: 'center' }}>
                    <p style={{ fontWeight: 600, color: '#334155' }}>The vehicle owner is currently unavailable or declined.</p>
                    <button type="button" onClick={() => setTab('chat')}>
                      💬 Send a Chat Message Instead
                    </button>
                    <button type="button" className="connect-secondary" onClick={() => setCallPhase('READY')}>
                      Try Calling Again
                    </button>
                  </div>
                )}

                {callPhase === 'ERROR' && (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <p className="connect-error">
                      We could not start the private call. Please ensure microphone permissions are allowed and try again.
                    </p>
                    <button type="button" onClick={() => void startVoiceCall()}>
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* App Deep Link Helper */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>
                Vehicle owner or using the V MOTIV app?
              </p>
              <button
                type="button"
                className="connect-secondary"
                onClick={openApp}
                style={{ fontSize: '13px', minHeight: '38px', padding: '0 16px' }}
              >
                Open in V MOTIV App
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

/**
 * The public website only explains the platform. Everything transactional (test drives, selling, service, rentals,
 * account) happens in the mobile app, so old links to those pages simply take people to the "Get the app" section.
 */
const APP_ONLY_PATHS = ['/cars', '/sell', '/service', '/rentals', '/account'];

function MarketingApp() {
  const [legalModalType, setLegalModalType] = useState<'terms' | 'privacy' | null>(null);

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  const navigateTo = (sectionId: string) => {
    scrollToSection(sectionId);
    window.history.replaceState({}, '', sectionId === 'hero' ? '/' : `/#${sectionId}`);
  };

  // Deep links and back navigation: /terms, /privacy and section links; former app-only pages point to the app section.
  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (path === '/terms') setLegalModalType('terms');
      else if (path === '/privacy') setLegalModalType('privacy');
      else if (APP_ONLY_PATHS.includes(path) || ['cars', 'sell', 'service', 'rentals'].includes(hash)) scrollToSection('app');
      else if (['/how-it-works', '/about', '/contact'].includes(path)) scrollToSection(path.slice(1));
      else if (hash) scrollToSection(hash);
    };
    handleLocation();
    window.addEventListener('popstate', handleLocation);
    window.addEventListener('hashchange', handleLocation);
    return () => {
      window.removeEventListener('popstate', handleLocation);
      window.removeEventListener('hashchange', handleLocation);
    };
  }, []);

  return (
    <div className="site-shell">
      <Navbar onNavigate={navigateTo} />

      <main>
        <Hero onGetApp={() => navigateTo('app')} onHowItWorks={() => navigateTo('how-it-works')} />
        <QuickActions onGetApp={() => navigateTo('app')} />
        <HowItWorks />
        <WhyVMotiv />
        <MobileAppSection />
        <AboutSection />
        <FAQSection />
        <FinalCTA onGetApp={() => navigateTo('app')} onHowItWorks={() => navigateTo('how-it-works')} />
      </main>

      <Footer
        onNavigate={navigateTo}
        onOpenPrivacy={() => setLegalModalType('privacy')}
        onOpenTerms={() => setLegalModalType('terms')}
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
    <RequestProgress />
    <App />
    <Toaster />
  </React.StrictMode>
);
