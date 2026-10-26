import React from 'react';

export const AboutSection: React.FC = () => {
  const cities = ['Bengaluru'];

  return (
    <section id="about" className="about-section">
      <div className="container">
        <div className="about-grid">
          <div className="about-text-col">
            <span className="section-eyebrow">ABOUT V MOTIV</span>
            <h2 className="section-title">A fresh, accountable approach to pre-owned cars.</h2>
            <p className="about-paragraph">
              Founded on a simple principle—that buying or selling a pre-owned car shouldn’t feel like
              a gamble. Too often, customers face hidden mechanical problems, opaque valuations, and
              endless paperwork delays.
            </p>
            <p className="about-paragraph">
              At V MOTIV, we bring verified transparency and personal accountability back into the equation.
              Every vehicle we list has been inspected in person. Every selling valuation is supported by
              factual diagnostics. And every transaction is supported from first enquiry to final RC transfer.
            </p>

            <div className="about-motto-box">
              <span className="motto-label">OUR CORE PROMISE</span>
              <p className="motto-text">“YOUR VEHICLE. OUR ACCOUNTABILITY.”</p>
            </div>
          </div>

          <div className="about-presence-col">
            <div className="presence-card">
              <h3 className="presence-title">Active Service Cities</h3>
              <p className="presence-subtitle">
                Physical hubs and doorstep inspection teams currently operating across:
              </p>
              <div className="cities-badge-grid">
                {cities.map((city) => (
                  <div key={city} className="city-badge">
                    <span className="city-pin">📍</span>
                    <span className="city-name">{city}</span>
                  </div>
                ))}
              </div>

              <div className="presence-support-info">
                <h4>Customer Support & Enquiries</h4>
                <p>Have questions about a listing or want to book an inspection over the phone?</p>
                <div className="contact-links-list">
                  <a href="mailto:support@vmotiv.in" className="contact-link">
                    <span>✉️</span>
                    <span>support@vmotiv.in</span>
                  </a>
                  <span className="contact-hours">Monday – Saturday: 9:00 AM – 7:00 PM IST</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
