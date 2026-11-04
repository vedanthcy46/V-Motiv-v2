import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { CityItem } from '../types';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  cities: CityItem[];
  onRequestAuth: (reason: string) => void;
}

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  user,
  cities,
  onRequestAuth,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'packages' | 'book'>('packages');
  const [selectedPackage, setSelectedPackage] = useState('PERIODIC_STANDARD');

  // Booking form states
  const [customerName, setCustomerName] = useState(user?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phoneNumber?.replace('+91', '') || '');
  const [city, setCity] = useState(cities[0]?.name || 'Bengaluru');
  const [make, setMake] = useState('Hyundai');
  const [model, setModel] = useState('Creta');
  const [fuelType, setFuelType] = useState('PETROL');
  const [fulfillmentType, setFulfillmentType] = useState<'DOORSTEP_PICKUP' | 'HUB_DROP'>('DOORSTEP_PICKUP');
  const [address, setAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [timeSlot, setTimeSlot] = useState('10:00 - 12:00');
  const [customerNotes, setCustomerNotes] = useState('');
  const [selectedPaymentPlan, setSelectedPaymentPlan] = useState('ZERO_UPFRONT');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

  const packages = [
    {
      id: 'PERIODIC_STANDARD',
      title: 'Standard Periodic Service',
      price: '₹2,999',
      features: [
        '45-point vehicle health checklist',
        'Engine oil & genuine filter replacement',
        'Brake pad cleaning & inspection',
        'Air & cabin filter check/cleaning',
        'Coolant & brake fluid level top-ups',
        'Complete interior vacuum & exterior foam wash',
      ],
      recommendedFor: 'Recommended every 10,000 km or 6 months',
    },
    {
      id: 'PERIODIC_COMPREHENSIVE',
      title: 'Comprehensive Major Service',
      price: '₹5,499',
      features: [
        'Everything in Standard Service',
        'Fully synthetic engine oil replacement',
        'Spark plug & fuel filter check',
        'Throttle body cleaning & tuning',
        'Wheel alignment & 4-wheel dynamic balancing',
        'Battery load test & electrical health scan',
      ],
      recommendedFor: 'Recommended every 20,000 km or 12 months',
    },
    {
      id: 'AC_SERVICE',
      title: 'AC Disinfection & Deep Cooling',
      price: '₹1,899',
      features: [
        'AC gas pressure & leak detection',
        'Condenser high-pressure foam wash',
        'Evaporator core disinfection',
        'Cabin antibacterial ozone treatment',
        'AC blower cleaning & vent sanitization',
      ],
      recommendedFor: 'Restores icy cooling and eliminates odors',
    },
    {
      id: 'DIAGNOSTIC_SCAN',
      title: 'Multi-Point Electronic Diagnostics',
      price: '₹799',
      features: [
        'OBD-II complete ECU electronic scan',
        'Check Engine & ABS warning light diagnosis',
        'Sensor performance data live telemetry',
        'Transmission & clutch actuator health check',
        'Comprehensive digital fault report with quotation',
      ],
      recommendedFor: 'For unexpected warning lights or performance issues',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestAuth('Please sign in with your Google account to confirm your car service appointment.');
      return;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian phone number.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // No website booking endpoint is wired yet. Never fabricate a booking reference.
      throw new Error('Online service booking from the website is not available yet. Please book in the V MOTIV mobile app or contact V MOTIV; no appointment has been created.');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit service booking. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-content modal-service"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-modal-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close car service dialog"
        >
          ×
        </button>

        <div className="service-modal-header">
          <span className="modal-kicker">V MOTIV AUTOMOTIVE CARE</span>
          <h2 id="service-modal-title">Authorized Vehicle Servicing & Repairs</h2>
          <p className="modal-subtitle">
            Doorstep pickup or local workshop drop. Genuine OEM parts, transparent itemized estimates, and real-time digital tracking.
          </p>

          <div className="service-tab-switch">
            <button
              type="button"
              className={`service-tab-btn ${activeTab === 'packages' ? 'active' : ''}`}
              onClick={() => setActiveTab('packages')}
            >
              Service Packages & Rates
            </button>
            <button
              type="button"
              className={`service-tab-btn ${activeTab === 'book' ? 'active' : ''}`}
              onClick={() => setActiveTab('book')}
            >
              Book Service Appointment
            </button>
          </div>
        </div>

        <div className="service-modal-body">
          {error && <div className="alert-error" role="alert">{error}</div>}

          {bookingSuccess ? (
            <div className="booking-success-card">
              <div className="success-icon-wrap">✓</div>
              <h3>Service Request Confirmed!</h3>
              <p className="success-reference">
                Reference Code: <strong>{bookingSuccess}</strong>
              </p>
              <p className="success-desc">
                Your service appointment for <strong>{make} {model}</strong> on <strong>{scheduledDate} ({timeSlot})</strong> has been received by the V MOTIV Service Hub in {city}.
                Our Service Advisor will call you at <strong>+91 {customerPhone}</strong> to confirm logistics and pre-intake checklist.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          ) : activeTab === 'packages' ? (
            <div className="packages-grid">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`package-card ${selectedPackage === pkg.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPackage(pkg.id)}
                >
                  <div className="package-card-header">
                    <h4>{pkg.title}</h4>
                    <span className="package-price">{pkg.price}</span>
                  </div>
                  <div className="package-recommended">{pkg.recommendedFor}</div>
                  <ul className="package-features">
                    {pkg.features.map((feat, idx) => (
                      <li key={idx}>✓ {feat}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-select-package"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPackage(pkg.id);
                      setActiveTab('book');
                    }}
                  >
                    Select & Book Appointment →
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <form className="service-book-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="service-pkg">Selected Service Category</label>
                  <select
                    id="service-pkg"
                    value={selectedPackage}
                    onChange={(e) => setSelectedPackage(e.target.value)}
                  >
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.price})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="service-city">Service City</label>
                  <select
                    id="service-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  >
                    {cities.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="service-make">Car Brand / Make *</label>
                  <input
                    id="service-make"
                    type="text"
                    required
                    placeholder="e.g. Hyundai, Honda, Maruti Suzuki"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="service-model">Car Model *</label>
                  <input
                    id="service-model"
                    type="text"
                    required
                    placeholder="e.g. Creta, City, Baleno"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="service-fuel">Fuel Type</label>
                  <select
                    id="service-fuel"
                    value={fuelType}
                    onChange={(e) => setFuelType(e.target.value)}
                  >
                    <option value="PETROL">Petrol</option>
                    <option value="DIESEL">Diesel</option>
                    <option value="EV">Electric (EV)</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="CNG">CNG</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="service-fulfillment">Fulfillment Method *</label>
                  <select
                    id="service-fulfillment"
                    value={fulfillmentType}
                    onChange={(e) => setFulfillmentType(e.target.value as any)}
                  >
                    <option value="DOORSTEP_PICKUP">🚗 Doorstep Pickup & Drop (Recommended)</option>
                    <option value="HUB_DROP">🏢 Self-Drop at V MOTIV Service Hub</option>
                  </select>
                </div>

                {fulfillmentType === 'DOORSTEP_PICKUP' && (
                  <div className="form-group full-width">
                    <label htmlFor="service-address">Pickup Address & Landmark *</label>
                    <input
                      id="service-address"
                      type="text"
                      required
                      placeholder="Apartment / Flat, Street, Landmark, Area"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="service-date">Preferred Service Date *</label>
                  <input
                    id="service-date"
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="service-slot">Preferred Slot</label>
                  <select
                    id="service-slot"
                    value={timeSlot}
                    onChange={(e) => setTimeSlot(e.target.value)}
                  >
                    <option value="09:00 - 11:00">09:00 - 11:00 AM</option>
                    <option value="11:00 - 13:00">11:00 AM - 01:00 PM</option>
                    <option value="14:00 - 16:00">02:00 - 04:00 PM</option>
                    <option value="16:00 - 18:00">04:00 - 06:00 PM</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="service-name">Your Full Name *</label>
                  <input
                    id="service-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="service-phone">Contact Mobile Number *</label>
                  <div className="input-prefix-group">
                    <span className="input-prefix">+91</span>
                    <input
                      id="service-phone"
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="9876543210"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="service-notes">Any Specific Symptoms, Noises, or Requests</label>
                  <textarea
                    id="service-notes"
                    rows={2}
                    placeholder="e.g. Squeaking sound on hard braking, AC cooling feels low during afternoon traffic..."
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                  />
                </div>

                <div className="form-group full-width" style={{ marginTop: '0.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <label style={{ fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>Select Booking Payment Plan</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    {[
                      { id: 'ZERO_UPFRONT', title: 'Zero Upfront', sub: 'Pay ₹0 Now (Settle at Workshop)' },
                      { id: 'PARTIAL_ADVANCE_25', title: 'Priority Advance (25%)', sub: 'Pay 25% to lock priority bay' },
                      { id: 'FULL_PAYMENT_100', title: 'Full Advance (100%)', sub: 'Pay 100% for express release' },
                    ].map(p => (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: `1px solid ${selectedPaymentPlan === p.id ? 'var(--accent, #f7b503)' : 'rgba(255, 255, 255, 0.15)'}`,
                          background: selectedPaymentPlan === p.id ? 'rgba(247, 181, 3, 0.08)' : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="paymentPlan"
                            checked={selectedPaymentPlan === p.id}
                            onChange={() => setSelectedPaymentPlan(p.id)}
                          />
                          <strong style={{ fontSize: '0.85rem' }}>{p.title}</strong>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted, #888)', marginTop: '4px', marginLeft: '1.25rem' }}>{p.sub}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab('packages')}
                >
                  ← Back to Packages
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                >
                  {busy ? 'Booking Appointment…' : 'Confirm Service Booking'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
