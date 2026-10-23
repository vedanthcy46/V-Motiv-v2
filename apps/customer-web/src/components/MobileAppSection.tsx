import React from 'react';

export const MobileAppSection: React.FC = () => {
  return (
    <section className="mobile-app-section">
      <div className="container mobile-app-container">
        <div className="mobile-app-content">
          <span className="section-eyebrow">SEAMLESS CONVENIENCE</span>
          <h2 className="section-title">Take V MOTIV With You Anywhere</h2>
          <p className="section-subtitle">
            Experience the complete buying and selling journey directly from your smartphone.
            Track appointments, review inspection offers, and chat with support in real time.
          </p>

          <ul className="app-feature-list">
            <li>
              <div className="app-feature-icon">📲</div>
              <div>
                <strong>Live Request Tracking</strong>
                <p>Monitor your test-drive bookings, purchase enquiries, and selling leads on a unified timeline.</p>
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
            <div className="app-badge-pill">
              <span className="badge-os-icon">🤖</span>
              <span>Available on Android</span>
            </div>
            <div className="app-badge-pill">
              <span className="badge-os-icon">🍎</span>
              <span>Available on iOS</span>
            </div>
          </div>
        </div>

        {/* Visual Phone Mockup */}
        <div className="mobile-app-visual" aria-hidden="true">
          <div className="mockup-phone">
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
