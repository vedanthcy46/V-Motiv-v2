import React, { useState } from 'react';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'Can I book or buy through this website?',
    answer:
      'No. This website explains how V MOTIV works. Test drives, selling requests, purchase enquiries, service bookings and rentals are all done in the V MOTIV mobile app, where you sign in with your Google account and can track every request.',
  },
  {
    id: 'faq-2',
    question: 'How does V MOTIV inspect and verify vehicles?',
    answer:
      'Every vehicle undergoes a hands-on physical inspection by our certified automotive technicians. We evaluate the engine, transmission, steering, suspension, electronics, and body panel integrity. We check for structural accidents or flood damage, and we document exact cosmetic and mechanical conditions truthfully.',
  },
  {
    id: 'faq-3',
    question: 'Can I take a test drive before making any commitment?',
    answer:
      'Yes, absolutely. In the V MOTIV app you can pick an available date and time slot for a test drive at your nearest V MOTIV hub or at your home address (where doorstep service is supported in your city). Test drives are completely obligation-free.',
  },
  {
    id: 'faq-4',
    question: 'How is the selling valuation calculated?',
    answer:
      'Share your car details in the app. We combine comprehensive physical diagnostics with current live regional market demand data. You receive an itemized, transparent offer that reflects your vehicle’s actual condition, mileage, and maintenance history—without arbitrary on-the-spot deductions.',
  },
  {
    id: 'faq-5',
    question: 'Who handles the RTO Registration Certificate (RC) transfer?',
    answer:
      'V MOTIV actively assists and manages the RC transfer documentation for both buyers and sellers. We collect the required RTO forms, verify signatures, submit the transfer, and provide you with milestone updates until the official RC transfer is complete.',
  },
  {
    id: 'faq-7',
    question: 'Does V MOTIV also service and rent cars?',
    answer:
      'Yes. Besides buying and selling, you can book servicing for your own car at a V MOTIV hub, approve the estimate before work starts, and rent cars by the day. Both are available in the app.',
  },
  {
    id: 'faq-6',
    question: 'What cities does V MOTIV currently operate in?',
    answer:
      'We currently operate physical hubs and mobile evaluation teams across Bengaluru, Chennai, Delhi NCR, Hyderabad, Mumbai, and Pune, with plans to gradually expand based on operational standards.',
  },
];

export const FAQSection: React.FC = () => {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(['faq-1', 'faq-2']));

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <section id="faq" className="faq-section">
      <div className="container">
        <div className="section-header-centered">
          <span className="section-eyebrow">COMMON QUESTIONS</span>
          <h2 className="section-title">Frequently Asked Questions</h2>
          <p className="section-subtitle">
            Everything you need to know about purchasing or selling a vehicle with V MOTIV.
          </p>
        </div>

        <div className="faq-accordion-list">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openIds.has(item.id);

            return (
              <div key={item.id} className={`faq-item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  id={`btn-${item.id}`}
                  className="faq-question-btn"
                  aria-expanded={isOpen}
                  aria-controls={`panel-${item.id}`}
                  onClick={() => toggle(item.id)}
                >
                  <span className="faq-question-text">{item.question}</span>
                  <span className="faq-icon" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>

                {isOpen && (
                  <div
                    id={`panel-${item.id}`}
                    role="region"
                    aria-labelledby={`btn-${item.id}`}
                    className="faq-answer-panel"
                  >
                    <p className="faq-answer-text">{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
