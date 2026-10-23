import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { CityItem } from '../types';
import { submitSellLead } from '../api';

interface SellCarModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  cities: CityItem[];
  onRequestAuth: (reason: string) => void;
}

export const SellCarModal: React.FC<SellCarModalProps> = ({
  isOpen,
  onClose,
  user,
  cities,
  onRequestAuth,
}) => {
  if (!isOpen) return null;

  const currentYear = new Date().getFullYear();

  const [sellerName, setSellerName] = useState(user?.displayName || '');
  const [sellerPhone, setSellerPhone] = useState(user?.phoneNumber?.replace('+91', '') || '');
  const [city, setCity] = useState(cities[0]?.name || 'Bengaluru');
  const [pincode, setPincode] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [manufacturingYear, setManufacturingYear] = useState<number>(currentYear - 3);
  const [fuelType, setFuelType] = useState('PETROL');
  const [transmission, setTransmission] = useState('MANUAL');
  const [odometerKm, setOdometerKm] = useState<number>(35000);
  const [expectedPrice, setExpectedPrice] = useState('');
  const [inspectionLocationType, setInspectionLocationType] = useState<'HUB' | 'HOME'>('HUB');
  const [inspectionAddress, setInspectionAddress] = useState('');
  const [sellerNotes, setSellerNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestAuth('Please sign in to submit your vehicle for evaluation.');
      return;
    }

    const cleanPhone = sellerPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please provide a valid 10-digit Indian phone number.');
      return;
    }

    if (!/^\d{6}$/.test(pincode.trim())) {
      setError('Please provide a valid 6-digit PIN code.');
      return;
    }

    if (inspectionLocationType === 'HOME' && inspectionAddress.trim().length < 10) {
      setError('Please provide your full address for doorstep inspection (min 10 characters).');
      return;
    }

    let pricePaise: number | undefined;
    if (expectedPrice.trim()) {
      const numPrice = parseFloat(expectedPrice);
      if (!isNaN(numPrice) && numPrice > 0) {
        pricePaise = Math.round(numPrice * 100);
      }
    }

    setBusy(true);
    setError(null);
    try {
      await submitSellLead(user, {
        sellerName: sellerName.trim(),
        sellerPhone: `+91${cleanPhone}`,
        city,
        pincode: pincode.trim(),
        make: make.trim(),
        model: model.trim(),
        variant: variant.trim() || undefined,
        manufacturingYear,
        fuelType,
        transmission,
        odometerKm,
        expectedPricePaise: pricePaise,
        inspectionLocationType,
        inspectionAddress: inspectionLocationType === 'HOME' ? inspectionAddress.trim() : undefined,
        sellerNotes: sellerNotes.trim() || undefined,
      });
      setSubmittedSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Unable to submit vehicle details. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sell-modal-title">
      <div className="modal-dialog sell-modal-dialog">
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close modal"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="modal-header">
          <div className="modal-icon-badge">📋</div>
          <h2 id="sell-modal-title" className="modal-title">Sell Your Car</h2>
          <p className="modal-subtitle">
            Provide basic details about your vehicle to schedule a physical evaluation and receive a
            transparent valuation from V MOTIV.
          </p>
        </div>

        {submittedSuccess ? (
          <div className="sell-success-view">
            <div className="success-icon-badge">✓</div>
            <h3>Vehicle Details Received!</h3>
            <p>
              Thank you for sharing your car details. Our local team in <strong>{city}</strong> has
              received your request and will contact you at <strong>+91 {sellerPhone}</strong> to
              coordinate your evaluation appointment.
            </p>
            <div className="success-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Close & Return to Homepage
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="sell-form-body">
            {error && (
              <div className="alert-box alert-error" role="alert">
                <span>⚠️</span>
                <p>{error}</p>
              </div>
            )}

            <div className="form-section-title">1. Contact & Location</div>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="seller-name">Your Full Name</label>
                <input
                  id="seller-name"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="seller-phone">Mobile Number (+91)</label>
                <input
                  id="seller-phone"
                  type="tel"
                  placeholder="10-digit number"
                  maxLength={10}
                  value={sellerPhone}
                  onChange={(e) => setSellerPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="seller-city">Operating City</label>
                <select
                  id="seller-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  {cities.length ? (
                    cities.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Bengaluru">Bengaluru</option>
                      <option value="Chennai">Chennai</option>
                      <option value="Delhi NCR">Delhi NCR</option>
                      <option value="Hyderabad">Hyderabad</option>
                      <option value="Mumbai">Mumbai</option>
                      <option value="Pune">Pune</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="seller-pincode">Area PIN Code</label>
                <input
                  id="seller-pincode"
                  type="text"
                  placeholder="6 digits"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-section-title">2. Vehicle Specifications</div>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="car-make">Make (Brand)</label>
                <input
                  id="car-make"
                  type="text"
                  placeholder="e.g. Hyundai, Toyota, Honda"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="car-model">Model</label>
                <input
                  id="car-model"
                  type="text"
                  placeholder="e.g. Creta, Innova, City"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor="car-variant">Variant (Optional)</label>
                <input
                  id="car-variant"
                  type="text"
                  placeholder="e.g. SX (O), VX"
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="car-year">Year</label>
                <select
                  id="car-year"
                  value={manufacturingYear}
                  onChange={(e) => setManufacturingYear(parseInt(e.target.value, 10))}
                >
                  {Array.from({ length: 20 }, (_, i) => currentYear - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="car-km">Kilometres</label>
                <input
                  id="car-km"
                  type="number"
                  min={0}
                  max={2000000}
                  step={1000}
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(parseInt(e.target.value, 10) || 0)}
                  required
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="car-fuel">Fuel Type</label>
                <select
                  id="car-fuel"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                >
                  <option value="PETROL">Petrol</option>
                  <option value="DIESEL">Diesel</option>
                  <option value="CNG">CNG</option>
                  <option value="ELECTRIC">Electric</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="car-trans">Transmission</label>
                <select
                  id="car-trans"
                  value={transmission}
                  onChange={(e) => setTransmission(e.target.value)}
                >
                  <option value="MANUAL">Manual</option>
                  <option value="AUTOMATIC">Automatic</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="car-expected-price">Expected Selling Price (₹ Optional)</label>
              <input
                id="car-expected-price"
                type="number"
                placeholder="e.g. 850000"
                value={expectedPrice}
                onChange={(e) => setExpectedPrice(e.target.value)}
              />
            </div>

            <div className="form-section-title">3. Evaluation Location</div>
            <div className="form-group">
              <div className="radio-group-row">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="sell-loc"
                    value="HUB"
                    checked={inspectionLocationType === 'HUB'}
                    onChange={() => setInspectionLocationType('HUB')}
                  />
                  <span>Bring to V MOTIV Hub ({city})</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="sell-loc"
                    value="HOME"
                    checked={inspectionLocationType === 'HOME'}
                    onChange={() => setInspectionLocationType('HOME')}
                  />
                  <span>Doorstep Inspection</span>
                </label>
              </div>
            </div>

            {inspectionLocationType === 'HOME' && (
              <div className="form-group">
                <label htmlFor="seller-addr">Doorstep Address</label>
                <textarea
                  id="seller-addr"
                  rows={2}
                  placeholder="Street address, building name, and landmark"
                  value={inspectionAddress}
                  onChange={(e) => setInspectionAddress(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="seller-notes">Additional Notes (Optional)</label>
              <textarea
                id="seller-notes"
                rows={2}
                placeholder="Mention any recent service history, tyres replacement, or accessories"
                value={sellerNotes}
                onChange={(e) => setSellerNotes(e.target.value)}
              />
            </div>

            <div className="form-submit-row">
              <button type="submit" className="btn btn-accent btn-block" disabled={busy}>
                {busy ? 'Submitting Details…' : 'Submit Car for Evaluation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
