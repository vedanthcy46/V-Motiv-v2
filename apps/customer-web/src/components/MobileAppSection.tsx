import React from 'react';

const ANDROID_URL = (import.meta.env.VITE_ANDROID_APP_URL as string | undefined)?.trim() || 'https://play.google.com/store/apps/details?id=in.vmotiv.customer';
const IOS_URL = (import.meta.env.VITE_IOS_APP_URL as string | undefined)?.trim() || '';

/** A real store link when the listing is configured; otherwise an honest "coming soon" label instead of a dead button. */
const StoreBadge: React.FC<{ href: string; icon: string; name: string }> = ({ href, icon, name }) =>
  href ? (
    <a className="app-badge-pill app-badge-link" href={href} target="_blank" rel="noreferrer">
      <span className="badge-os-icon">{icon}</span>
      <span>Get it on {name}</span>
    </a>
  ) : (
    <span className="app-badge-pill" aria-label={`${name} app coming soon`}>
      <span className="badge-os-icon">{icon}</span>
      <span>{name}: coming soon</span>
    </span>
  );

export const MobileAppSection: React.FC = () => {
  return (
    <section id="app" className="mobile-app-section">
      <div className="container mobile-app-container">
        <div className="mobile-app-content">
          <span className="section-eyebrow">THE V MOTIV APP</span>
          <h2 className="section-title">Book, track and manage it all in the app</h2>
          <p className="section-subtitle">
            Test drives, selling requests, service bookings and rentals are all handled in the V MOTIV
            app, not on this website. Sign in with Google, track every request and chat with support in real time.
          </p>

          <ul className="app-feature-list">
            <li>
              <div className="app-feature-icon">📲</div>
              <div>
                <strong>Live Request Tracking</strong>
                <p>Monitor your test drives, purchase enquiries, selling requests, service jobs and rentals on one timeline.</p>
              </div>
            </li>
            <li>
              <div className="app-feature-icon">⚡</div>
              <div>
                <strong>Instant Offer Reviews</strong>
                <p>Receive itemized vehicle inspection valuations and accept or decline with complete clarity.</p>
              </div>
            </li>
            <li>
              <div className="app-feature-icon">💬</div>
              <div>
                <strong>Integrated Support</strong>
                <p>Direct communication with your personal automotive advisor whenever you need guidance.</p>
              </div>
            </li>
          </ul>

          <div className="app-badges-row">
            <StoreBadge href={ANDROID_URL} icon="🤖" name="Android" />
            <StoreBadge href={IOS_URL} icon="🍎" name="iOS" />
          </div>
        </div>
        {/* Visual Phone Mockup */}
        <div className="mobile-app-visual" aria-hidden="true">
          <div className="app-phone-mock">
            <div className="mockup-notch" />
            <div className="mockup-screen">
              <div className="mockup-header">
                <span className="mockup-brand">V MOTIV</span>
                <span className="mockup-status-dot" />
              </div>
              <div className="mockup-content-preview">
                <div className="mockup-pill">Test Drive Scheduled</div>
                <div className="mockup-car-title">2023 Tata Nexon XZ+</div>
                <div className="mockup-date-slot">Tomorrow • 10:00 - 12:00</div>
                <div className="mockup-hub-badge">Bengaluru Hub</div>
                <div className="mockup-status-bar">
                  <div className="status-progress-fill" />
                </div>
                <div className="mockup-caption">Advisor assigned • Documents verified</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
