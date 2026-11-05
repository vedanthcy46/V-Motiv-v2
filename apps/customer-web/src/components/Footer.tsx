import React from 'react';
import { SiteFooter } from '@vmotiv/ui';

interface FooterProps {
  onNavigate: (sectionId: string) => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

/** The public site's footer is the shared V MOTIV footer; only its content is specific here. */
export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenPrivacy, onOpenTerms }) => (
  <SiteFooter
    id="contact"
    tagline="V MOTIV is an accountable pre-owned automotive platform operating in major Indian metros. We prioritise transparency, factual inspections and complete ownership transfer care."
    columns={[
      {
        title: 'Navigation',
        links: [
          { label: 'Home', href: '#hero', onClick: () => onNavigate('hero') },
          { label: 'The platform', href: '#platform', onClick: () => onNavigate('platform') },
          { label: 'How it works', href: '#how-it-works', onClick: () => onNavigate('how-it-works') },
          { label: 'Get the app', href: '#app', onClick: () => onNavigate('app') },
          { label: 'Why V MOTIV', href: '#why-vmotiv', onClick: () => onNavigate('why-vmotiv') },
          { label: 'About us', href: '#about', onClick: () => onNavigate('about') },
        ],
      },
      {
        title: 'Operating hubs',
        content: (
          <p>
            <strong className="text-white">Bengaluru</strong><br />
            Sulibele Road, near Veera Kempamma Veera Tamanna Kula Devastana, Lakkondanahalli, Hoskote, Alappanahalli, Karnataka 562165
          </p>
        ),
      },
      {
        title: 'Support and assistance',
        content: (
          <div className="grid gap-2">
            <p>Questions about an existing request, inventory item or evaluation?</p>
            <a href="mailto:support@vmotiv.in" className="underline">support@vmotiv.in</a>
            <span>Mon – Sat: 9:00 AM – 7:00 PM IST</span>
          </div>
        ),
      },
    ]}
    legal={
      <span className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>© {new Date().getFullYear()} V MOTIV Technologies. All rights reserved.</span>
        <button type="button" className="underline-offset-2 hover:underline" onClick={onOpenTerms}>Terms of Service</button>
        <button type="button" className="underline-offset-2 hover:underline" onClick={onOpenPrivacy}>Privacy Policy</button>
      </span>
    }
  />
);
