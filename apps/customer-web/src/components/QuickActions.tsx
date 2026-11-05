import React from 'react';

interface QuickActionsProps {
  onGetApp: () => void;
}

const SERVICES = [
  {
    id: 'buy',
    badge: 'BUY',
    title: 'Buy a verified car',
    desc: 'Every car on V MOTIV is physically inspected before it is listed, with honest photos and a clear condition report.',
    points: ['Inspection summary and specifications for each car', 'Test drives at a hub or at your doorstep', 'Purchase enquiries without pushy sales calls', 'Assisted RC transfer and paperwork'],
  },
  {
    id: 'sell',
    badge: 'SELL',
    title: 'Sell your car',
    desc: 'Share your car details, get it inspected in person and receive a clear, accountable offer.',
    points: ['Simple details form', 'Hub or doorstep inspection', 'Itemised valuation, no surprise deductions', 'Prompt settlement and ownership transfer care'],
  },
  {
    id: 'service',
    badge: 'SERVICE',
    title: 'Car service',
    desc: 'Book servicing and repairs for your own car at V MOTIV hubs, with an estimate you approve before work starts.',
    points: ['Pickup and drop where supported', 'Estimates you approve first', 'Progress updates through the job', 'Invoice and service history in one place'],
  },
  {
    id: 'rent',
    badge: 'RENT',
    title: 'Car rentals',
    desc: 'Rent a car by the day from a V MOTIV hub, with transparent pricing and a documented handover.',
    points: ['Clear daily rates and kilometre limits', 'Online KYC and payment', 'Recorded condition at pickup and return', 'Support during your trip'],
  },
];

export const QuickActions: React.FC<QuickActionsProps> = ({ onGetApp }) => {
  return (
    <section id="platform" className="quick-actions-section">
      <div className="container">
        <div className="section-header-centered">
          <span className="section-eyebrow">THE PLATFORM</span>
          <h2 className="section-title">Everything about your car, in one app.</h2>
          <p className="section-subtitle">
            Buying, selling, servicing and renting all follow the same promise: clear steps, truthful
            information and a real person accountable for each one. You do all of it in the V MOTIV app.
          </p>
        </div>
        <div className="quick-actions-grid">
          {SERVICES.map((item) => (
            <div key={item.id} className={`action-card action-card-${item.id}`}>
              <div className={`card-badge ${item.id === 'sell' ? 'card-badge-accent' : ''}`}>{item.badge}</div>
              <h3 className="card-title">{item.title}</h3>
              <p className="card-desc">{item.desc}</p>
              <ul className="card-features">
                {item.points.map((point) => (
                  <li key={point}>
                    <span className="feature-check">✓</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="platform-cta">
          <button type="button" className="btn btn-primary btn-lg" onClick={onGetApp}>
            <span>Get the V MOTIV app</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
};
