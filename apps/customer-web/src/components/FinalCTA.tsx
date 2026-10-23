import React from 'react';

interface FinalCTAProps {
  onExploreCars: () => void;
  onSellCar: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onExploreCars, onSellCar }) => {
  return (
    <section className="final-cta-section">
      <div className="container">
        <div className="final-cta-box">
          <div className="cta-glow" aria-hidden="true" />
          <span className="section-eyebrow eyebrow-light">START TODAY</span>
          <h2 className="cta-title">Ready to move forward with complete accountability?</h2>
          <p className="cta-subtitle">
            Whether you want to browse thoroughly verified pre-owned cars or receive a fair,
            transparent valuation for your current vehicle, we’re here to help.
          </p>

          <div className="cta-button-group">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={onExploreCars}
            >
              <span>Explore Verified Cars</span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary-light btn-lg"
              onClick={onSellCar}
            >
              <span>Sell Your Car</span>
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
