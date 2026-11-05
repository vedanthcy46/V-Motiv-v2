import React from 'react';

interface FinalCTAProps {
  onGetApp: () => void;
  onHowItWorks: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onGetApp, onHowItWorks }) => {
  return (
    <section className="final-cta-section">
      <div className="container">
        <div className="final-cta-box">
          <div className="cta-glow" aria-hidden="true" />
          <span className="section-eyebrow eyebrow-light">START TODAY</span>
          <h2 className="cta-title">Ready to move forward with complete accountability?</h2>
          <p className="cta-subtitle">
            Whether you want to buy a thoroughly verified pre-owned car, sell yours for a fair, transparent
            offer, or look after the one you drive, the V MOTIV app is where it happens.
          </p>
          <div className="cta-button-group">
            <button type="button" className="btn btn-primary btn-lg" onClick={onGetApp}>
              <span>Get the App</span>
              <span aria-hidden="true">→</span>
            </button>
            <button type="button" className="btn btn-secondary-light btn-lg" onClick={onHowItWorks}>
              <span>How It Works</span>
            </button>
          </div>
          <div className="cta-assurance-note">
            <span>🛡️ Obligation-free test drives • Transparent condition reports • Dedicated RC transfer support</span>
          </div>
        </div>
      </div>
    </section>
  );
};
