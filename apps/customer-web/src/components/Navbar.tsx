import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { Profile } from '../account-api';
import { BrandLogo } from './BrandLogo';

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

export const Navbar: React.FC<NavbarProps> = ({
  user,
  profile,
  authBusy,
  onOpenAuth,
  onOpenAccount,
  onNavigate,
  onOpenService,
  onOpenRentals,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    onNavigate(sectionId);
  };

  return (
    <header className="site-header">
      <div className="header-inner container">
        <a
          href="/"
          className="header-brand"
          aria-label="V MOTIV Home"
          onClick={(e) => handleNavClick(e, 'hero')}
        >
          <BrandLogo variant="horizontal" height={38} />
        </a>

        {/* Desktop Navigation */}
        <nav className="desktop-nav" aria-label="Main Navigation">
          <ul className="nav-list">
            <li>
              <a href="#hero" onClick={(e) => handleNavClick(e, 'hero')}>Home</a>
            </li>
            <li>
              <a href="#cars" onClick={(e) => handleNavClick(e, 'cars')}>Buy Cars</a>
            </li>
            <li>
              <a href="#sell" onClick={(e) => handleNavClick(e, 'sell')}>Sell Your Car</a>
            </li>
            <li>
              <a
                href="#service"
                onClick={(e) => {
                  e.preventDefault();
                  if (onOpenService) onOpenService();
                  else handleNavClick(e, 'service');
                }}
              >
                Service
              </a>
            </li>
            <li>
              <a
                href="#rentals"
                onClick={(e) => {
                  e.preventDefault();
                  if (onOpenRentals) onOpenRentals();
                  else handleNavClick(e, 'rentals');
                }}
              >
                Rentals
              </a>
            </li>
            <li>
              <a href="#how-it-works" onClick={(e) => handleNavClick(e, 'how-it-works')}>How It Works</a>
            </li>
            <li>
              <a href="#why-vmotiv" onClick={(e) => handleNavClick(e, 'why-vmotiv')}>Why V MOTIV</a>
            </li>
            <li>
              <a href="#about" onClick={(e) => handleNavClick(e, 'about')}>About</a>
            </li>
            <li>
              <a href="#contact" onClick={(e) => handleNavClick(e, 'contact')}>Contact</a>
            </li>
          </ul>
        </nav>

        {/* Account / Action Area */}
        <div className="header-actions">
          {user ? (
            <button
              type="button"
              className="btn btn-account"
              onClick={onOpenAccount}
              aria-label="Open your account profile"
            >
              <span className="account-avatar-dot" />
              <span className="account-name">
                {profile?.displayName?.split(' ')[0] || user.displayName?.split(' ')[0] || 'Account'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-signin"
              onClick={onOpenAuth}
              disabled={authBusy}
              aria-label="Sign in with your Google account"
            >
              <svg className="google-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.3-.8-.4-1.8-.4-2.8s.1-2 .4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.1 7.5 23 12 23z"
                />
              </svg>
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className={`mobile-menu-toggle ${mobileMenuOpen ? 'is-active' : ''}`}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer" role="dialog" aria-modal="true">
          <ul className="mobile-nav-list">
            <li>
              <a href="#hero" onClick={(e) => handleNavClick(e, 'hero')}>Home</a>
            </li>
            <li>
              <a href="#cars" onClick={(e) => handleNavClick(e, 'cars')}>Buy Cars</a>
            </li>
            <li>
              <a href="#sell" onClick={(e) => handleNavClick(e, 'sell')}>Sell Your Car</a>
            </li>
            <li>
              <a
                href="#service"
                onClick={(e) => {
                  e.preventDefault();
                  if (onOpenService) onOpenService();
                  else handleNavClick(e, 'service');
                }}
              >
                Service
              </a>
            </li>
            <li>
              <a
                href="#rentals"
                onClick={(e) => {
                  e.preventDefault();
                  if (onOpenRentals) onOpenRentals();
                  else handleNavClick(e, 'rentals');
                }}
              >
                Rentals
              </a>
            </li>
            <li>
              <a href="#how-it-works" onClick={(e) => handleNavClick(e, 'how-it-works')}>How It Works</a>
            </li>
            <li>
              <a href="#why-vmotiv" onClick={(e) => handleNavClick(e, 'why-vmotiv')}>Why V MOTIV</a>
            </li>
            <li>
              <a href="#about" onClick={(e) => handleNavClick(e, 'about')}>About</a>
            </li>
            <li>
              <a href="#contact" onClick={(e) => handleNavClick(e, 'contact')}>Contact</a>
            </li>
            <li className="mobile-nav-divider" />
            <li>
              {user ? (
                <button
                  type="button"
                  className="btn btn-account mobile-auth-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAccount();
                  }}
                >
                  <span className="account-avatar-dot" />
                  <span>Your Account ({profile?.displayName || user.displayName || 'Customer'})</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-signin mobile-auth-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth();
                  }}
                >
                  <span>Sign In with Google</span>
                </button>
              )}
            </li>
          </ul>
        </div>
      )}
    </header>
  );
};
