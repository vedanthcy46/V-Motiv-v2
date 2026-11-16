import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isScrapPath } from './scrap/route';
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

const PLAY_STORE_FALLBACK = 'https://play.google.com/store/apps/details?id=in.vmotiv.customer';
const ANDROID_URL = (import.meta.env.VITE_ANDROID_APP_URL as string | undefined)?.trim() || PLAY_STORE_FALLBACK;
const IOS_URL = (import.meta.env.VITE_IOS_APP_URL as string | undefined)?.trim() || '';

/**
 * Where a V MOTIV Connect sticker lands when it is scanned with any camera or QR app. Private calls and messages happen only in the
 * V MOTIV app (the owner's number stays hidden and the app handles the microphone), so this page never calls or chats: it opens the
 * app when it is installed (the app then shows this car's private call and message options) and otherwise offers the app to install.
 */
function ConnectGetAppPage({ token }: { token: string }) {
  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes('android');
  const isIos = /iphone|ipad|ipod/.test(ua);
  const deepLink = `vmotiv://connect/scan?token=${encodeURIComponent(token)}`;
  // Android: open the app if it is installed, otherwise go straight to its Play Store page.
  const androidIntent = `intent://connect/scan?token=${encodeURIComponent(token)}#Intent;scheme=vmotiv;package=in.vmotiv.customer;S.browser_fallback_url=${encodeURIComponent(ANDROID_URL)};end`;

  const openApp = () => {
    if (isAndroid) {
      window.location.assign(androidIntent);
      return;
    }
    window.location.assign(deepLink);
    // No app on this phone: the page is still showing after a moment, so send them to the store.
    if (isIos && IOS_URL) window.setTimeout(() => { if (!document.hidden) window.location.assign(IOS_URL); }, 1400);
  };

  return (
    <main className="connect-public-page">
      <section className="connect-public-card" style={{ textAlign: 'center' }}>
        <img src="/brand/vmotiv-icon.png" alt="V MOTIV" className="connect-logo" style={{ margin: '0 auto 12px' }} />
        <div className="connect-vehicle-badge" style={{ display: 'inline-block', marginBottom: '12px' }}>
          <span>🛡️ V MOTIV Connect</span>
        </div>
        <h1>Contact this vehicle's owner privately</h1>
        <p className="connect-copy">
          Calls and messages for this car happen in the V MOTIV app, so the owner's phone number stays hidden. Open the app to
          continue, or install it first. You can scan again from the app's login screen without signing in.
        </p>

        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          <button type="button" onClick={openApp}>Open in the V MOTIV app</button>
          {(isAndroid || !isIos) && (
            <a className="connect-secondary" href={ANDROID_URL} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
              Get it on Google Play
            </a>
          )}
          {(isIos || !isAndroid) && IOS_URL ? (
            <a className="connect-secondary" href={IOS_URL} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
              Get it on the App Store
            </a>
          ) : null}
        </div>

        <ol style={{ listStyle: 'decimal', textAlign: 'left', margin: '18px 0 0', paddingLeft: '22px', fontSize: '13px', color: '#64748b', display: 'grid', gap: '4px' }}>
          <li>Install the V MOTIV app.</li>
          <li>On the login screen choose "Scan a V MOTIV Connect QR without signing in" and scan this sticker again, or sign in first.</li>
          <li>Choose a private call or a message.</li>
        </ol>
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

// The scrapping area (sign-in, forms, requests) is a separate chunk that downloads only when someone opens /scrap, so the landing page stays
// as small and fast as before.
const ScrapApp = lazy(() => import('./scrap/ScrapApp'));

function App() {
  const match = window.location.pathname.match(/^\/connect\/([A-Za-z0-9_-]{32,128})\/?$/i);
  if (match) return <ConnectGetAppPage token={match[1]} />;
  if (isScrapPath(window.location.pathname)) {
    return (
      <Suspense fallback={<p role="status" style={{ padding: 24 }}>Loading…</p>}>
        <ScrapApp />
      </Suspense>
    );
  }
  return <MarketingApp />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RequestProgress />
    <App />
    <Toaster />
  </React.StrictMode>
);
