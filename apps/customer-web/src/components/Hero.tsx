import React from 'react';

interface HeroProps {
  onExploreCars: () => void;
  onSellCar: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onExploreCars, onSellCar }) => {
  return (
    <section id="hero" className="hero-section">
      <div className="container hero-container">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="badge-dot" />
            <span>ACCOUNTABLE AUTOMOTIVE PLATFORM</span>
          </div>

          <h1 className="hero-title">
            A better way to <span className="text-highlight">buy and sell</span> your car.
          </h1>

          <p className="hero-lead">
            Explore available cars or tell us about the car you want to sell. Clear steps,
            helpful people and updates throughout your journey.
          </p>

          <div className="hero-tagline-callout">
            <span className="tagline-quote">“YOUR VEHICLE. OUR ACCOUNTABILITY.”</span>
          </div>

          <div className="hero-cta-group">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={onExploreCars}
            >
              <span>Explore Cars</span>
              <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={onSellCar}
            >
              <span>Sell Your Car</span>
            </button>
          </div>

          {/* Trust Highlights */}
          <div className="hero-trust-bar">
            <div className="trust-item">
              <span className="trust-icon">✓</span>
              <div>
                <strong>Verified Details</strong>
                <span>Factual inspection reports</span>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">✓</span>
              <div>
                <strong>Supported Hubs</strong>
                <span>Active local presence</span>
              </div>
            </div>
            <div className="trust-item">
              <span className="trust-icon">✓</span>
              <div>
                <strong>Clear Process</strong>
                <span>Direct tracking on every step</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Visual Panel */}
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-card-preview">
            <div className="preview-top-badge">VERIFIED SELECTION</div>
            <div className="preview-image-wrap">
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpjMfN5Zf2hT5IamhsGctaV7zIQkayHWhUR3gsQElkoA&s=10"
                alt="V MOTIV verified car showcase"
                className="preview-car-image"
                loading="eager"
              />
              <span className="preview-status-pill">Available for Test Drive</span>
            </div>
            <div className="preview-card-details">
              <div className="preview-title-row">
                <div className="preview-car-title">Tata Nexon XZ+</div>
                <div className="preview-car-price">₹10.45 Lakh</div>
              </div>
              <div className="preview-meta-row">
                <span>2023</span>
                <span>•</span>
                <span>18,500 km</span>
                <span>•</span>
                <span>Manual</span>
                <span>•</span>
                <span>Bengaluru</span>
              </div>
              <div className="preview-badge-row">
                <span className="spec-tag">180-Point Check</span>
                <span className="spec-tag">Single Owner</span>
                <span className="spec-tag">Zero Accidental</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
