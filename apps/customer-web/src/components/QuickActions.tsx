import React from 'react';

interface QuickActionsProps {
  onBuyClick: () => void;
  onSellClick: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onBuyClick, onSellClick }) => {
  return (
    <section className="quick-actions-section">
      <div className="container">
        <div className="section-header-centered">
          <span className="section-eyebrow">CHOOSE YOUR PATH</span>
          <h2 className="section-title">Built around what you need today.</h2>
          <p className="section-subtitle">
            Whether purchasing your next vehicle or parting with your current one, our process is clear,
            truthful, and backed by genuine customer support.
          </p>
        </div>

        <div className="quick-actions-grid">
          {/* Card 1: Buy a Car */}
          <div className="action-card action-card-buy">
            <div className="card-badge">FOR BUYERS</div>
            <h3 className="card-title">Buy a Verified Car</h3>
            <p className="card-desc">
              Discover carefully evaluated vehicles with authentic photographs, real condition reports,
              and assisted test-drive scheduling.
            </p>
            <ul className="card-features">
              <li>
                <span className="feature-check">✓</span>
                <span>Browse real published vehicles with genuine photography</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Review detailed inspection summaries and specifications</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Book a test drive at your preferred hub or doorstep</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Submit purchase enquiries with zero aggressive sales calls</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Assisted RC transfer and verified paperwork handover</span>
              </li>
            </ul>
            <div className="card-btn-wrap">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={onBuyClick}
              >
                <span>Browse Available Cars</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          {/* Card 2: Sell Your Car */}
          <div id="sell" className="action-card action-card-sell">
            <div className="card-badge card-badge-accent">FOR SELLERS</div>
            <h3 className="card-title">Sell Your Car</h3>
            <p className="card-desc">
              Share your vehicle details in minutes, arrange an in-person physical inspection, and receive
              a clear, accountable offer based on factual evaluation.
            </p>
            <ul className="card-features">
              <li>
                <span className="feature-check">✓</span>
                <span>Enter vehicle details in a simple 2-minute form</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Schedule hub or doorstep inspection at your convenience</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Receive transparent valuation based on real market condition</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Review offer with clear versioning and transparent decisions</span>
              </li>
              <li>
                <span className="feature-check">✓</span>
                <span>Prompt payment settlement & complete ownership transfer care</span>
              </li>
            </ul>
            <div className="card-btn-wrap">
              <button
                type="button"
                className="btn btn-accent btn-block"
                onClick={onSellClick}
              >
                <span>Request Car Evaluation</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
