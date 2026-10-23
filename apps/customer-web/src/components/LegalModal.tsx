import React from 'react';

interface LegalModalProps {
  isOpen: boolean;
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, type, onClose }) => {
  if (!isOpen || !type) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
      <div className="modal-dialog legal-modal-dialog">
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="modal-header">
          <h2 id="legal-modal-title" className="modal-title">
            {type === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </h2>
          <p className="modal-subtitle">V MOTIV Technologies • Effective October 2026</p>
        </div>

        <div className="legal-content-scroll">
          {type === 'terms' ? (
            <div className="legal-text">
              <h3>1. Platform Scope & Purpose</h3>
              <p>
                V MOTIV provides an accountable automotive platform facilitating the discovery, inspection,
                test-driving, and transaction of verified pre-owned vehicles. By accessing or using our
                services, you agree to these Terms.
              </p>

              <h3>2. Public Discovery & Account Registration</h3>
              <p>
                Public browsing of vehicle inventory is available without registration. Submitting enquiries,
                booking test drives, or requesting vehicle selling valuations requires account authentication
                through verified Google sign-in to ensure accountable customer communication.
              </p>

              <h3>3. Inspection & Test Drives</h3>
              <p>
                Test-drive requests represent customer scheduling preferences and are confirmed based on vehicle
                availability and valid driver licensing. Test drives must be conducted in compliance with Indian
                motor vehicle regulations.
              </p>

              <h3>4. Vehicle Selling & Offers</h3>
              <p>
                Valuations provided through our platform are contingent upon physical verification of the
                vehicle’s condition, mechanical components, and legal title documents. Offers are versioned and
                require explicit acceptance.
              </p>

              <h3>5. Ownership Transfer Assistance</h3>
              <p>
                V MOTIV assists buyers and sellers in processing official RTO Registration Certificate (RC)
                ownership transfers. Both parties agree to provide authentic identification and signed statutory
                forms required by the relevant RTO jurisdiction.
              </p>
            </div>
          ) : (
            <div className="legal-text">
              <h3>1. Information We Collect</h3>
              <p>
                When you use V MOTIV, we collect information necessary to provide our automotive services:
                account details via Google authentication (name, email), phone numbers for request coordination,
                and vehicle information submitted during sell or enquiry requests.
              </p>

              <h3>2. How We Use Your Data</h3>
              <p>
                We use your data strictly to:
              </p>
              <ul>
                <li>Coordinate test-drive appointments and seller evaluations.</li>
                <li>Send transactional notifications regarding your inquiries and offers.</li>
                <li>Verify ownership and assist with RTO transfer documentation.</li>
              </ul>

              <h3>3. Marketing & Communication Choices</h3>
              <p>
                We do not sell your personal contact information to third-party marketing brokers.
                Promotional communications are strictly opt-in and can be updated anytime in your account settings.
              </p>

              <h3>4. Data Security & Storage</h3>
              <p>
                Your information is encrypted during transit and stored in protected databases. You have the
                right to request an export of your customer data or account deletion by contacting support@vmotiv.in.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
