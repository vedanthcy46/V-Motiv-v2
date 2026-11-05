import React from 'react';
import { Navbar as SiteNavbar } from '@vmotiv/ui';

interface NavbarProps {
  onNavigate: (sectionId: string) => void;
}

/** The public site's top navigation is the shared V MOTIV navbar; only the links are specific here. */
export const Navbar: React.FC<NavbarProps> = ({ onNavigate }) => {
  const links = [
    { label: 'Home', href: '#hero', onClick: () => onNavigate('hero') },
    { label: 'The Platform', href: '#platform', onClick: () => onNavigate('platform') },
    { label: 'How It Works', href: '#how-it-works', onClick: () => onNavigate('how-it-works') },
    { label: 'Why V MOTIV', href: '#why-vmotiv', onClick: () => onNavigate('why-vmotiv') },
    { label: 'About', href: '#about', onClick: () => onNavigate('about') },
    { label: 'FAQ', href: '#faq', onClick: () => onNavigate('faq') },
    { label: 'Contact', href: '#contact', onClick: () => onNavigate('contact') },
  ];
  const getApp = (
    <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('app')}>
      Get the App
    </button>
  );
  return <SiteNavbar logo="/brand/vmotiv-logo.svg" links={links} actions={getApp} onBrandClick={() => onNavigate('hero')} />;
};
