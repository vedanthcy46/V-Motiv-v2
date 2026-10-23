import React, { useState } from 'react';

export const HowItWorks: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');

  return (
    <section id="how-it-works" className="how-it-works-section">
      <div className="container">
        <div className="section-header-centered">
          <span className="section-eyebrow">CLEAR & ACCOUNTABLE PROCESS</span>
          <h2 className="section-title">How V MOTIV Works</h2>
          <p className="section-subtitle">
            No confusion, no hidden clauses, no aggressive sales. Step-by-step transparency from day one.
          </p>

          <div className="toggle-tab-group" role="tablist" aria-label="How it works workflow toggle">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'buy'}
              className={`toggle-tab ${activeTab === 'buy' ? 'active' : ''}`}
              onClick={() => setActiveTab('buy')}
            >
              How Buying Works
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sell'}
              className={`toggle-tab ${activeTab === 'sell' ? 'active' : ''}`}
              onClick={() => setActiveTab('sell')}
            >
              How Selling Works
            </button>
          </div>
        </div>

        {/* Buying Workflow */}
        {activeTab === 'buy' && (
          <div className="workflow-grid" role="tabpanel" aria-label="How buying works">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-title">Browse Verified Cars</h3>
              <p className="step-desc">
                Explore real published inventory with authentic photos, actual odometer readings,
                and comprehensive vehicle histories. No bait-and-switch listings.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-title">Request a Test Drive</h3>
              <p className="step-desc">
                Choose your preferred date, convenient time slot, and location preference
                (our local service hub or doorstep where available).
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-title">Inspect in Person</h3>
              <p className="step-desc">
                Evaluate the car thoroughly. Our representatives answer your technical questions
                honestly without high-pressure sales tactics.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">04</div>
              <h3 className="step-title">Accountable Handover</h3>
              <p className="step-desc">
                Complete assisted RC ownership transfer, clear documentation, and direct delivery.
                We stay accountable through the entire transfer.
              </p>
            </div>
          </div>
        )}

        {/* Selling Workflow */}
        {activeTab === 'sell' && (
          <div className="workflow-grid" role="tabpanel" aria-label="How selling works">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-title">Share Vehicle Details</h3>
              <p className="step-desc">
                Provide your vehicle's make, model, year, fuel type, and current mileage in a quick
                2-minute online intake form.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-title">Schedule Inspection</h3>
              <p className="step-desc">
                Pick a slot for a free physical condition inspection at our nearest hub or right
                at your doorstep by a certified automotive technician.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-title">Receive Clear Offer</h3>
              <p className="step-desc">
                Get a transparent, itemized valuation based on actual vehicle condition and market
                demand. No hidden deduction surprises.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">04</div>
              <h3 className="step-title">Instant Payment & RC Care</h3>
              <p className="step-desc">
                Upon agreement, receive prompt payment settlement while we manage complete RC transfer
                documentation and delivery logistics.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
