import React from 'react';
import { BrandLogo } from './BrandLogo';

interface FooterProps {
  onNavigate: (sectionId: string) => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenPrivacy, onOpenTerms }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="contact" className="site-footer">
      <div className="container footer-container">
        <div className="footer-top-grid">
          {/* Brand Column */}
          <div className="footer-brand-col">
            <div className="footer-brand-lockup">
              <BrandLogo variant="lockup" height={130} />
            </div>
            <p className="footer-about-snippet">
              V MOTIV is an accountable pre-owned automotive platform operating in major Indian metros.
              We prioritize transparency, factual inspections, and complete ownership transfer care.
            </p>
          </div>

          {/* Quick Links Column */}
          <div className="footer-nav-col">
            <h4 className="footer-col-title">Navigation</h4>
            <ul className="footer-links-list">
              <li>
                <a href="#hero" onClick={(e) => { e.preventDefault(); onNavigate('hero'); }}>
                  Home
                </a>
              </li>
              <li>
                <a href="#cars" onClick={(e) => { e.preventDefault(); onNavigate('cars'); }}>
                  Browse Available Cars
                </a>
              </li>
              <li>
                <a href="#sell" onClick={(e) => { e.preventDefault(); onNavigate('sell'); }}>
                  Sell Your Car
                </a>
              </li>
              <li>
                <a href="#how-it-works" onClick={(e) => { e.preventDefault(); onNavigate('how-it-works'); }}>
                  How Buying Works
                </a>
              </li>
              <li>
                <a href="#why-vmotiv" onClick={(e) => { e.preventDefault(); onNavigate('why-vmotiv'); }}>
                  Why V MOTIV
                </a>
              </li>
              <li>
                <a href="#about" onClick={(e) => { e.preventDefault(); onNavigate('about'); }}>
                  About Us
                </a>
              </li>
            </ul>
          </div>

          {/* Operating Hubs */}
          <div className="footer-hubs-col">
            <h4 className="footer-col-title">Operating Hubs</h4>
            <ul className="footer-hubs-list">
              <li>Bengaluru • Indiranagar & Electronic City</li>
              <li>Chennai • Guindy & OMR</li>
              <li>Delhi NCR • Gurugram & Noida</li>
              <li>Hyderabad • Hitec City & Gachibowli</li>
              <li>Mumbai • BKC & Andheri</li>
              <li>Pune • Baner & Kharadi</li>
            </ul>
          </div>

          {/* Contact & Support */}
          <div className="footer-contact-col">
            <h4 className="footer-col-title">Support & Assistance</h4>
            <p className="footer-contact-desc">
              Have questions regarding an existing request, inventory item, or evaluation?
            </p>
            <div className="footer-contact-details">
              <div className="contact-row">
                <span className="contact-icon">✉️</span>
                <a href="mailto:support@vmotiv.in">support@vmotiv.in</a>
              </div>
              <div className="contact-row">
                <span className="contact-icon">⏰</span>
                <span>Mon – Sat: 9:00 AM – 7:00 PM IST</span>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-divider" />

        <div className="footer-bottom-row">
          <p className="footer-copyright">
            © {currentYear} V MOTIV Technologies. All rights reserved.
          </p>

          <div className="footer-legal-links">
            <button
              type="button"
              className="footer-legal-btn"
              onClick={onOpenTerms}
            >
              Terms of Service
            </button>
            <span className="footer-separator">•</span>
            <button
              type="button"
              className="footer-legal-btn"
              onClick={onOpenPrivacy}
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
