import React from 'react';
import type { User } from 'firebase/auth';
import { Navbar as SiteNavbar } from '@vmotiv/ui';
import type { Profile } from '../account-api';

interface NavbarProps {
  user: User | null;
  profile: Profile | null;
  authBusy: boolean;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
  onNavigate: (sectionId: string) => void;
  onOpenService?: () => void;
  onOpenRentals?: () => void;
}

const GoogleMark = () => (
  <svg className="google-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
    <path fill="#FBBC05" d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z" />
    <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z" />
  </svg>
);

/** The public site's top navigation is the shared V MOTIV navbar; only the links and the account button are specific here. */
export const Navbar: React.FC<NavbarProps> = ({ user, profile, authBusy, onOpenAuth, onOpenAccount, onNavigate, onOpenService, onOpenRentals }) => {
  const firstName = profile?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Account';
  const links = [
    { label: 'Home', href: '#hero', onClick: () => onNavigate('hero') },
    { label: 'Buy Cars', href: '#cars', onClick: () => onNavigate('cars') },
    { label: 'Sell Your Car', href: '#sell', onClick: () => onNavigate('sell') },
    { label: 'Service', href: '#service', onClick: () => (onOpenService ? onOpenService() : onNavigate('service')) },
    { label: 'Rentals', href: '#rentals', onClick: () => (onOpenRentals ? onOpenRentals() : onNavigate('rentals')) },
    { label: 'How It Works', href: '#how-it-works', onClick: () => onNavigate('how-it-works') },
    { label: 'Why V MOTIV', href: '#why-vmotiv', onClick: () => onNavigate('why-vmotiv') },
    { label: 'About', href: '#about', onClick: () => onNavigate('about') },
    { label: 'Contact', href: '#contact', onClick: () => onNavigate('contact') },
  ];
  const account = user ? (
    <button type="button" className="btn btn-account" onClick={onOpenAccount} aria-label="Open your account profile">
      <span className="account-avatar-dot" />
      <span className="account-name">{firstName}</span>
    </button>
  ) : (
    <button type="button" className="btn btn-signin" onClick={onOpenAuth} disabled={authBusy} aria-label="Sign in with your Google account">
      <GoogleMark />
      <span>Sign in</span>
    </button>
  );
  return <SiteNavbar logo="/brand/vmotiv-logo.svg" links={links} actions={account} onBrandClick={() => onNavigate('hero')} />;
};
