import React from 'react';

export const WhyVMotiv: React.FC = () => {
  return (
    <section id="why-vmotiv" className="why-section">
      <div className="container">
        <div className="section-header-centered">
          <span className="section-eyebrow">THE V MOTIV DIFFERENCE</span>
          <h2 className="section-title">Why Car Buyers & Sellers Trust Us</h2>
          <p className="section-subtitle">
            The used car market is filled with exaggerated claims. We focus on genuine accountability,
            truthful evaluation, and dependable support.
          </p>
        </div>

        <div className="why-grid">
          <div className="why-card">
            <div className="why-icon-box">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="why-title">Accountability First</h3>
            <p className="why-text">
              We stand behind our listings and our commitments. From test drives to transfer ownership,
              you have a responsible contact person assisting your journey.
            </p>
          </div>

          <div className="why-card">
            <div className="why-icon-box">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <h3 className="why-title">Factual Verification</h3>
            <p className="why-text">
              Every published vehicle is physically inspected. Engine diagnostics, body panel status,
              and service records are accurately documented without exaggeration.
            </p>
          </div>

          <div className="why-card">
            <div className="why-icon-box">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3 className="why-title">Clear & Fast Communication</h3>
            <p className="why-text">
              Track your enquiries, test-drive preferences, and selling offers in real-time. No automated
              spam or persistent nuisance marketing calls.
            </p>
          </div>

          <div className="why-card">
            <div className="why-icon-box">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <h3 className="why-title">Complete Paperwork Assistance</h3>
            <p className="why-text">
              Ownership transfer is usually the biggest friction point. We handle the documentation,
              RTO forms, and status tracking until the RC is transferred.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
