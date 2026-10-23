import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
import { fetchCities } from './api';
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

function App() {
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

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
