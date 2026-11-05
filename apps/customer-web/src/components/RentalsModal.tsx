import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { CityItem } from '../types';

interface RentalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  cities: CityItem[];
  onRequestAuth: (reason: string) => void;
}

export const RentalsModal: React.FC<RentalsModalProps> = ({
  isOpen,
  onClose,
  user,
  cities,
  onRequestAuth,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'fleet' | 'reserve'>('fleet');
  const [selectedVehicleCategory, setSelectedVehicleCategory] = useState('COMPACT_SUV');

  // Booking states
  const [customerName, setCustomerName] = useState(user?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phoneNumber?.replace('+91', '') || '');
  const [city, setCity] = useState(cities[0]?.name || 'Bengaluru');
  const [pickupHub, setPickupHub] = useState('Bengaluru Central Hub (Koramangala)');

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(18, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservationSuccess, setReservationSuccess] = useState<string | null>(null);

  const fleetCategories = [
    {
      id: 'PREMIUM_HATCHBACK',
      name: 'Premium Hatchback',
      example: 'Hyundai i20 / Maruti Baleno',
      dailyRate: 1800,
      deposit: 4000,
      seats: 5,
      transmission: 'Manual / Automatic',
      fuel: 'Petrol',
      features: ['Free km per day set by hub, shown at booking', 'Touchscreen infotainment & CarPlay', 'Reverse camera with guidelines', 'Dual front airbags & ABS'],
    },
    {
      id: 'COMPACT_SUV',
      name: 'Compact SUV',
      example: 'Hyundai Creta / Kia Seltos / Brezza',
      dailyRate: 2800,
      deposit: 5000,
      seats: 5,
      transmission: 'Automatic / Manual',
      fuel: 'Petrol / Diesel',
      features: ['Free km per day set by hub, shown at booking', 'High ground clearance & cruise control', 'Panoramic sunroof (select variants)', 'Wireless phone charging & LED headlamps'],
    },
    {
      id: 'EXECUTIVE_SEDAN',
      name: 'Executive Sedan',
      example: 'Honda City / Hyundai Verna',
      dailyRate: 2600,
      deposit: 5000,
      seats: 5,
      transmission: 'Automatic (CVT / DCT)',
      fuel: 'Petrol',
      features: ['Free km per day set by hub, shown at booking', 'Class-leading rear seat legroom', '510L large boot for outstation luggage', 'ADAS Level 2 active safety'],
    },
    {
      id: 'PREMIUM_SUV_MPV',
      name: '7-Seater Premium MPV / SUV',
      example: 'Toyota Innova Crysta / Mahindra XUV700',
      dailyRate: 3900,
      deposit: 8000,
      seats: 7,
      transmission: 'Automatic / Manual',
      fuel: 'Diesel / Petrol',
      features: ['Free km per day set by hub, shown at booking', 'Captain seats with dual-zone AC', 'Rugged performance for hills & highways', 'Electronic stability & 6 airbags standard'],
    },
  ];

  const calculateDays = () => {
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return 1;
    const diffHours = (e - s) / (1000 * 60 * 60);
    return Math.max(1, Math.ceil(diffHours / 24));
  };

  const selectedCatObj = fleetCategories.find(c => c.id === selectedVehicleCategory) || fleetCategories[1]!;
  const days = calculateDays();
  const baseTotal = selectedCatObj.dailyRate * days;
  const gstAmount = Math.round(baseTotal * 0.18);
  const grandTotal = baseTotal + gstAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestAuth('Please sign in with your Google account to hold your self-drive rental car.');
      return;
    }

    const s = new Date(startDate).getTime();
    const eTime = new Date(endDate).getTime();
    if (eTime - s < 8 * 60 * 60 * 1000) {
      setError('Minimum rental duration is 8 hours.');
      return;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please provide a valid 10-digit Indian mobile number.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // No website reservation endpoint is wired yet. Never fabricate a reservation code.
      throw new Error('Online rental reservation from the website is not available yet. Please reserve in the V MOTIV mobile app or contact V MOTIV; no vehicle has been held.');
    } catch (err: any) {
      setError(err?.message || 'Failed to submit rental reservation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-content modal-rentals"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rentals-modal-title"
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close self-drive rental dialog"
        >
          ×
        </button>

        <div className="service-modal-header">
          <span className="modal-kicker">V MOTIV SELF-DRIVE FLEET</span>
          <h2 id="rentals-modal-title">Premium Self-Drive Car Rentals</h2>
          <p className="modal-subtitle">
            Impeccably maintained fleet, transparent pricing, hub-specific free kilometres, comprehensive commercial insurance, and instant 100% deposit refund.
          </p>

          <div className="service-tab-switch">
            <button
              type="button"
              className={`service-tab-btn ${activeTab === 'fleet' ? 'active' : ''}`}
              onClick={() => setActiveTab('fleet')}
            >
              Fleet Categories & Rates
            </button>
            <button
              type="button"
              className={`service-tab-btn ${activeTab === 'reserve' ? 'active' : ''}`}
              onClick={() => setActiveTab('reserve')}
            >
              Reserve Self-Drive Car
            </button>
          </div>
        </div>

        <div className="service-modal-body">
          {error && <div className="alert-error" role="alert">{error}</div>}

          {reservationSuccess ? (
            <div className="booking-success-card">
              <div className="success-icon-wrap">✓</div>
              <h3>Rental Reservation Initiated!</h3>
              <p className="success-reference">
                Reservation Code: <strong>{reservationSuccess}</strong>
              </p>
              <p className="success-desc">
                Your reservation for <strong>{selectedCatObj.name} ({selectedCatObj.example})</strong> has been placed at <strong>{pickupHub}</strong>.
                Our Rental Coordinator will contact you at <strong>+91 {customerPhone}</strong> to guide you through Driver License KYC verification and pickup scheduling.
              </p>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', margin: '1.25rem 0', textAlign: 'left', fontSize: '0.875rem' }}>
                <div>Trip Period: <strong>{new Date(startDate).toLocaleString('en-IN')}</strong> to <strong>{new Date(endDate).toLocaleString('en-IN')}</strong> ({days} Days)</div>
                <div>Estimated Base Fare: <strong>₹{grandTotal.toLocaleString('en-IN')}</strong> (incl. 18% GST)</div>
                <div>Refundable Security Deposit: <strong>₹{selectedCatObj.deposit.toLocaleString('en-IN')}</strong> (authorized at vehicle pickup)</div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Close & View Account
              </button>
            </div>
          ) : activeTab === 'fleet' ? (
            <div>
              <div className="packages-grid">
                {fleetCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`package-card ${selectedVehicleCategory === cat.id ? 'selected' : ''}`}
                    onClick={() => setSelectedVehicleCategory(cat.id)}
                  >
                    <div className="package-card-header">
                      <h4>{cat.name}</h4>
                      <span className="package-price">₹{cat.dailyRate.toLocaleString('en-IN')}<small style={{ fontSize: '0.75rem', fontWeight: 400 }}>/day</small></span>
                    </div>
                    <div className="package-recommended">{cat.example}</div>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b', margin: '6px 0' }}>
                      {cat.transmission} · {cat.fuel} · {cat.seats} Seats
                    </div>
                    <ul className="package-features">
                      {cat.features.map((f, idx) => (
                        <li key={idx}>✓ {f}</li>
                      ))}
                      <li>🛡️ ₹{cat.deposit.toLocaleString('en-IN')} refundable security deposit</li>
                    </ul>
                    <button
                      type="button"
                      className="btn btn-select-package"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVehicleCategory(cat.id);
                        setActiveTab('reserve');
                      }}
                    >
                      Select Category & Reserve →
                    </button>
                  </div>
                ))}
              </div>

              {/* Guarantees bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                <div>
                  <strong>✓ 250 Km/Day Included</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Extra km at low flat rates</div>
                </div>
                <div>
                  <strong>✓ Commercial Insurance</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Full zero-dep third party & collision coverage</div>
                </div>
                <div>
                  <strong>✓ Instant Deposit Refund</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Released back immediately upon vehicle return</div>
                </div>
                <div>
                  <strong>✓ 24/7 Roadside Assist</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Pan-India breakdown & flatbed support</div>
                </div>
              </div>
            </div>
          ) : (
            <form className="service-book-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="rental-cat">Vehicle Category</label>
                  <select
                    id="rental-cat"
                    value={selectedVehicleCategory}
                    onChange={(e) => setSelectedVehicleCategory(e.target.value)}
                  >
                    {fleetCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — ₹{c.dailyRate}/day ({c.example})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="rental-city">Operating City</label>
                  <select
                    id="rental-city"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      setPickupHub(`${e.target.value} Central Hub`);
                    }}
                  >
                    {cities.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group full-width">
                  <label htmlFor="rental-hub">Pickup & Return Hub *</label>
                  <input
                    id="rental-hub"
                    type="text"
                    required
                    value={pickupHub}
                    onChange={(e) => setPickupHub(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="rental-start">Trip Start Date & Time *</label>
                  <input
                    id="rental-start"
                    type="datetime-local"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="rental-end">Trip Return Date & Time *</label>
                  <input
                    id="rental-end"
                    type="datetime-local"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="rental-name">Driver Full Name *</label>
                  <input
                    id="rental-name"
                    type="text"
                    required
                    placeholder="As shown on Driving License"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="rental-phone">Mobile Number *</label>
                  <div className="input-prefix-group">
                    <span className="input-prefix">+91</span>
                    <input
                      id="rental-phone"
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="9876543210"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>
              </div>

              {/* Price Calculation Card */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.875rem' }}>
                  <span>Base Rental ({days} days @ ₹{selectedCatObj.dailyRate}/day):</span>
                  <span>₹{baseTotal.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.875rem', color: '#64748b' }}>
                  <span>GST (18%):</span>
                  <span>₹{gstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem', color: '#64748b' }}>
                  <span>Refundable Security Deposit (held during trip):</span>
                  <span>₹{selectedCatObj.deposit.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', color: '#061A38' }}>
                  <span>Total Payable:</span>
                  <span style={{ color: '#F7B503' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab('fleet')}
                >
                  ← Back to Fleet
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy}
                >
                  {busy ? 'Confirming Hold…' : 'Reserve Self-Drive Car'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
