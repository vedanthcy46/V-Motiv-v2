import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ListingItem } from '../types';
import { formatLakh, formatInrPaise, submitTestDrive, submitEnquiry } from '../api';

interface VehicleDetailModalProps {
  vehicle: ListingItem | null;
  user: User | null;
  onClose: () => void;
  onRequestAuth: (reason: string) => void;
}

export const VehicleDetailModal: React.FC<VehicleDetailModalProps> = ({
  vehicle,
  user,
  onClose,
  onRequestAuth,
}) => {
  if (!vehicle) return null;

  const car = vehicle.vehicle;
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [activeAction, setActiveAction] = useState<'info' | 'drive' | 'enquire'>('info');

  // Test drive state
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split('T')[0];

  const [driveDate, setDriveDate] = useState(minDateStr);
  const [driveSlot, setDriveSlot] = useState<'10:00-12:00' | '12:00-14:00' | '15:00-17:00'>('10:00-12:00');
  const [drivePref, setDrivePref] = useState<'HUB' | 'HOME'>('HUB');
  const [driveAddress, setDriveAddress] = useState('');
  const [driveNotes, setDriveNotes] = useState('');

  // Enquiry state
  const [enquiryMsg, setEnquiryMsg] = useState('');

  // Submission state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const photos = vehicle.media?.length
    ? vehicle.media.map((m) => m.url)
    : ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'];

  const handleTestDriveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestAuth('Please sign in to schedule a test drive for this vehicle.');
      return;
    }

    if (drivePref === 'HOME' && driveAddress.trim().length < 10) {
      setError('Please provide a full address for home test-drive preference (min 10 characters).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submitTestDrive(user, {
        listingId: vehicle.id,
        requestedDate: driveDate,
        timeSlot: driveSlot,
        serviceCity: car.city,
        locationPreference: drivePref,
        address: drivePref === 'HOME' ? driveAddress.trim() : undefined,
        customerNotes: driveNotes.trim() || undefined,
      });
      setSuccessMsg('Test drive requested successfully! Our team will contact you to confirm the appointment.');
      setActiveAction('info');
    } catch (err: any) {
      setError(err.message || 'Unable to submit test drive request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequestAuth('Please sign in to send a purchase enquiry for this vehicle.');
      return;
    }

    if (!enquiryMsg.trim()) {
      setError('Enquiry message is required.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submitEnquiry(user, {
        listingId: vehicle.id,
        message: enquiryMsg.trim(),
      });
      setSuccessMsg('Enquiry sent successfully! Our automotive advisor will reply shortly.');
      setActiveAction('info');
    } catch (err: any) {
      setError(err.message || 'Unable to submit enquiry. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vehicle-modal-title">
      <div className="modal-dialog vehicle-modal-dialog">
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close vehicle details"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="vehicle-modal-grid">
          {/* Left Column: Photos Gallery */}
          <div className="vehicle-modal-gallery">
            <div className="main-photo-frame">
              <img
                src={photos[selectedPhotoIndex] || photos[0]}
                alt={vehicle.title}
                className="main-gallery-img"
              />
              <span className="gallery-counter">
                {selectedPhotoIndex + 1} / {photos.length}
              </span>
            </div>

            {photos.length > 1 && (
              <div className="thumbnails-row">
                {photos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`thumb-btn ${i === selectedPhotoIndex ? 'is-active' : ''}`}
                    onClick={() => setSelectedPhotoIndex(i)}
                  >
                    <img src={url} alt={`Thumbnail ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Vehicle Info & Actions */}
          <div className="vehicle-modal-info">
            <div className="modal-price-header">
              <div className="price-primary">{formatLakh(vehicle.pricePaise)}</div>
              <div className="price-paise">Exact: {formatInrPaise(vehicle.pricePaise)}</div>
            </div>

            <h2 id="vehicle-modal-title" className="modal-vehicle-title">
              {vehicle.title || `${car.manufacturingYear} ${car.make} ${car.model}`}
            </h2>
            <div className="modal-vehicle-city">📍 Located in {car.city}</div>

            {successMsg && (
              <div className="alert-box alert-success" role="alert">
                <span>✓</span>
                <p>{successMsg}</p>
              </div>
            )}

            {error && (
              <div className="alert-box alert-error" role="alert">
                <span>⚠️</span>
                <p>{error}</p>
              </div>
            )}

            {/* Sub-view: General Info */}
            {activeAction === 'info' && (
              <div className="vehicle-info-content">
                <div className="spec-table-grid">
                  <div className="table-row">
                    <span className="table-lbl">Make & Model</span>
                    <span className="table-val">{car.make} {car.model}</span>
                  </div>
                  <div className="table-row">
                    <span className="table-lbl">Variant</span>
                    <span className="table-val">{car.variant || 'Standard'}</span>
                  </div>
                  <div className="table-row">
                    <span className="table-lbl">Manufacturing Year</span>
                    <span className="table-val">{car.manufacturingYear}</span>
                  </div>
                  <div className="table-row">
                    <span className="table-lbl">Odometer</span>
                    <span className="table-val">{car.odometerKm.toLocaleString('en-IN')} km</span>
                  </div>
                  <div className="table-row">
                    <span className="table-lbl">Fuel Type</span>
                    <span className="table-val">{car.fuelType}</span>
                  </div>
                  <div className="table-row">
                    <span className="table-lbl">Transmission</span>
                    <span className="table-val">{car.transmission}</span>
                  </div>
                  {car.ownershipCount !== undefined && (
                    <div className="table-row">
                      <span className="table-lbl">Ownership</span>
                      <span className="table-val">{car.ownershipCount === 1 ? '1st Owner' : `${car.ownershipCount} Owners`}</span>
                    </div>
                  )}
                  {car.color && (
                    <div className="table-row">
                      <span className="table-lbl">Color</span>
                      <span className="table-val">{car.color}</span>
                    </div>
                  )}
                </div>

                {car.conditionSummary && (
                  <div className="condition-box">
                    <h4>Condition Summary</h4>
                    <p>{car.conditionSummary}</p>
                  </div>
                )}

                {car.inspectionSummary && (
                  <div className="inspection-box">
                    <h4>Inspection Report</h4>
                    <p>{car.inspectionSummary}</p>
                    {car.inspectionReportUrl && (
                      <a
                        href={car.inspectionReportUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inspection-link"
                      >
                        📄 View Official Inspection PDF
                      </a>
                    )}
                  </div>
                )}

                <div className="modal-cta-buttons">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setError(null);
                      setActiveAction('drive');
                    }}
                  >
                    Request Test Drive
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setError(null);
                      setActiveAction('enquire');
                    }}
                  >
                    Ask a Question
                  </button>
                </div>
              </div>
            )}

            {/* Sub-view: Test Drive Form */}
            {activeAction === 'drive' && (
              <form onSubmit={handleTestDriveSubmit} className="action-form">
                <div className="form-heading-row">
                  <h3>Book a Test Drive</h3>
                  <button
                    type="button"
                    className="btn-back-text"
                    onClick={() => setActiveAction('info')}
                  >
                    ← Back to info
                  </button>
                </div>

                <div className="form-group">
                  <label htmlFor="drive-date">Preferred Date (Next 30 days)</label>
                  <input
                    id="drive-date"
                    type="date"
                    min={minDateStr}
                    value={driveDate}
                    onChange={(e) => setDriveDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="drive-slot">Time Slot</label>
                  <select
                    id="drive-slot"
                    value={driveSlot}
                    onChange={(e) => setDriveSlot(e.target.value as any)}
                  >
                    <option value="10:00-12:00">Morning (10:00 AM – 12:00 PM)</option>
                    <option value="12:00-14:00">Midday (12:00 PM – 2:00 PM)</option>
                    <option value="15:00-17:00">Afternoon (3:00 PM – 5:00 PM)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Location Preference</label>
                  <div className="radio-group-row">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="pref"
                        value="HUB"
                        checked={drivePref === 'HUB'}
                        onChange={() => setDrivePref('HUB')}
                      />
                      <span>V MOTIV Hub ({car.city})</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="pref"
                        value="HOME"
                        checked={drivePref === 'HOME'}
                        onChange={() => setDrivePref('HOME')}
                      />
                      <span>Doorstep Test Drive</span>
                    </label>
                  </div>
                </div>

                {drivePref === 'HOME' && (
                  <div className="form-group">
                    <label htmlFor="drive-addr">Delivery / Home Address</label>
                    <textarea
                      id="drive-addr"
                      rows={2}
                      placeholder="Enter your street address and landmark"
                      value={driveAddress}
                      onChange={(e) => setDriveAddress(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="drive-notes">Notes or Requests (Optional)</label>
                  <input
                    id="drive-notes"
                    type="text"
                    placeholder="e.g. Any specific feature you'd like demonstrated"
                    value={driveNotes}
                    onChange={(e) => setDriveNotes(e.target.value)}
                  />
                </div>

                <div className="form-submit-row">
                  <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Submitting…' : 'Confirm Test Drive Request'}
                  </button>
                </div>
              </form>
            )}

            {/* Sub-view: Enquiry Form */}
            {activeAction === 'enquire' && (
              <form onSubmit={handleEnquirySubmit} className="action-form">
                <div className="form-heading-row">
                  <h3>Submit Purchase Enquiry</h3>
                  <button
                    type="button"
                    className="btn-back-text"
                    onClick={() => setActiveAction('info')}
                  >
                    ← Back to info
                  </button>
                </div>

                {/* Quick Topic Prompts */}
                <div className="quick-topics-row">
                  <span className="topics-label">Quick topics:</span>
                  <button
                    type="button"
                    className="topic-pill"
                    onClick={() => setEnquiryMsg('I would like to review the complete inspection checklist for this car.')}
                  >
                    Inspection Checklist
                  </button>
                  <button
                    type="button"
                    className="topic-pill"
                    onClick={() => setEnquiryMsg('Is this car available for immediate purchase and RC transfer?')}
                  >
                    Immediate Purchase
                  </button>
                  <button
                    type="button"
                    className="topic-pill"
                    onClick={() => setEnquiryMsg('Can I trade in my existing vehicle against this car?')}
                  >
                    Exchange / Trade-In
                  </button>
                </div>

                <div className="form-group">
                  <label htmlFor="enquiry-msg">Your Message (Required)</label>
                  <textarea
                    id="enquiry-msg"
                    rows={4}
                    placeholder="Type your question or enquiry here..."
                    value={enquiryMsg}
                    onChange={(e) => setEnquiryMsg(e.target.value)}
                    required
                  />
                </div>

                <div className="form-submit-row">
                  <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                    {busy ? 'Sending Enquiry…' : 'Send Enquiry to V MOTIV'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
