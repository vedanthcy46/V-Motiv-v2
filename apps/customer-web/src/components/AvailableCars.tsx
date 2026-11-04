import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { ListingItem } from '../types';
import { fetchInventory, fetchInventoryFacets, fetchUserDrives, formatLakh } from '../api';

interface AvailableCarsProps {
  user?: User | null;
  onSelectCar: (car: ListingItem) => void;
  onSellClick: () => void;
  bookedListingIds?: Set<string>;
}

export const AvailableCars: React.FC<AvailableCarsProps> = ({
  user,
  onSelectCar,
  onSellClick,
  bookedListingIds: externalBookedListingIds,
}) => {
  const [cars, setCars] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [fuelFilter, setFuelFilter] = useState<string>('ALL');
  const [transmissionFilter, setTransmissionFilter] = useState<string>('ALL');
  // Filter chips come from what is really in stock (falls back to the classic three if the request fails).
  const [fuelChips, setFuelChips] = useState<string[]>(['Petrol', 'Diesel']);
  const [transmissionChips, setTransmissionChips] = useState<string[]>(['Automatic']);
  useEffect(() => {
    let active = true;
    fetchInventoryFacets()
      .then((facets) => {
        if (!active) return;
        if (facets.fuelTypes.length) setFuelChips(facets.fuelTypes.map((f) => f.value));
        if (facets.transmissions.length) setTransmissionChips(facets.transmissions.map((t) => t.value));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const [internalBookedListingIds, setInternalBookedListingIds] = useState<Set<string>>(new Set());

  // Use external if provided by parent, otherwise fallback to internal
  const activeBookedIds = externalBookedListingIds ?? internalBookedListingIds;

  // Fetch user booked test drives for live card statuses (parity with mobile app)
  useEffect(() => {
    if (!user) {
      setInternalBookedListingIds(new Set());
      return;
    }
    let cancelled = false;
    fetchUserDrives(user)
      .then((drives) => {
        if (cancelled) return;
        const requestedIds = new Set(
          drives
            .filter((d) => d.status === 'REQUESTED' || d.status === 'CONFIRMED')
            .map((d) => d.listing?.id)
            .filter(Boolean) as string[]
        );
        setInternalBookedListingIds(requestedIds);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Immediately respond to app-wide drive booking or cancellation events
  useEffect(() => {
    const handleDriveChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ listingId: string; status: 'BOOKED' | 'CANCELLED' }>;
      if (!customEvent.detail) return;
      const { listingId, status } = customEvent.detail;
      setInternalBookedListingIds((prev) => {
        const next = new Set(prev);
        if (status === 'CANCELLED') {
          next.delete(listingId);
        } else if (status === 'BOOKED') {
          next.add(listingId);
        }
        return next;
      });
    };

    window.addEventListener('vmotiv:drive-changed', handleDriveChange);
    return () => {
      window.removeEventListener('vmotiv:drive-changed', handleDriveChange);
    };
  }, []);

  const loadCars = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInventory({
        limit: 6,
        fuelType: fuelFilter !== 'ALL' ? fuelFilter : undefined,
        transmission: transmissionFilter !== 'ALL' ? transmissionFilter : undefined,
      });
      setCars(res.items || []);
    } catch (err: any) {
      console.warn('Could not fetch inventory:', err);
      setError('Unable to load live listings right now. Please try again or check back shortly.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCars();
  }, [fuelFilter, transmissionFilter]);

  return (
    <section id="cars" className="available-cars-section">
      <div className="container">
        <div className="section-header-split">
          <div>
            <span className="section-eyebrow">VERIFIED INVENTORY</span>
            <h2 className="section-title">Available Verified Cars</h2>
            <p className="section-subtitle">
              Genuinely published vehicles ready for inspection and test drive. Real photos, real condition.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="filter-chips-row" role="group" aria-label="Filter vehicles by fuel type">
            <button
              type="button"
              className={`chip ${fuelFilter === 'ALL' && transmissionFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setFuelFilter('ALL');
                setTransmissionFilter('ALL');
              }}
            >
              All Cars
            </button>
            {fuelChips.map((fuel) => (
              <button
                key={fuel}
                type="button"
                className={`chip ${fuelFilter.toLowerCase() === fuel.toLowerCase() ? 'active' : ''}`}
                onClick={() => setFuelFilter(fuelFilter.toLowerCase() === fuel.toLowerCase() ? 'ALL' : fuel)}
              >
                {fuel}
              </button>
            ))}
            {transmissionChips.map((transmission) => (
              <button
                key={transmission}
                type="button"
                className={`chip ${transmissionFilter.toLowerCase() === transmission.toLowerCase() ? 'active' : ''}`}
                onClick={() => setTransmissionFilter(transmissionFilter.toLowerCase() === transmission.toLowerCase() ? 'ALL' : transmission)}
              >
                {transmission}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="inventory-loading-grid" aria-busy="true">
            {[1, 2, 3].map((n) => (
              <div key={n} className="car-card skeleton-card">
                <div className="skeleton-img" />
                <div className="skeleton-body">
                  <div className="skeleton-line skeleton-title" />
                  <div className="skeleton-line skeleton-price" />
                  <div className="skeleton-line skeleton-meta" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="inventory-empty-state" role="alert">
            <div className="empty-icon">⚠️</div>
            <h3>Unable to fetch inventory</h3>
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void loadCars()}>
              Try Again
            </button>
          </div>
        )}

        {/* Honest Empty State */}
        {!loading && !error && cars.length === 0 && (
          <div className="inventory-empty-state">
            <div className="empty-icon">🚗</div>
            <h3>New cars are coming soon</h3>
            <p>
              We only publish cars that meet our strict verification standards.
              Check back soon for newly verified vehicles, or tell us about the car you want to sell.
            </p>
            <div className="empty-actions">
              <button type="button" className="btn btn-primary" onClick={onSellClick}>
                Sell Your Car to V MOTIV
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setFuelFilter('ALL');
                  setTransmissionFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}

        {/* Cars Grid */}
        {!loading && !error && cars.length > 0 && (
          <div className="cars-grid">
            {cars.map((item) => {
              const car = item.vehicle;
              const photoUrl = item.media?.[0]?.url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80';

              const isBooked = activeBookedIds.has(item.id);

              return (
                <article key={item.id} className="car-card" aria-labelledby={`car-title-${item.id}`}>
                  <div className="car-card-media">
                    <img
                      src={photoUrl}
                      alt={`${car.manufacturingYear} ${car.make} ${car.model}`}
                      loading="lazy"
                      className="car-image"
                    />
                    <div className={`media-overlay-badge ${isBooked ? 'booked-overlay-badge' : ''}`}>
                      <span className={isBooked ? 'status-dot-yellow' : 'status-dot-green'} />
                      <span>{isBooked ? 'Drive Requested' : 'Available'}</span>
                    </div>
                  </div>

                  <div className="car-card-body">
                    <div className="car-price-row">
                      <span className="car-price">{formatLakh(item.pricePaise)}</span>
                      <span className="car-city-tag">{car.city}</span>
                    </div>

                    <h3 id={`car-title-${item.id}`} className="car-title">
                      {item.title || `${car.manufacturingYear} ${car.make} ${car.model} ${car.variant || ''}`}
                    </h3>

                    <div className="car-specs-grid">
                      <div className="spec-item">
                        <span className="spec-label">Year</span>
                        <span className="spec-value">{car.manufacturingYear}</span>
                      </div>
                      <div className="spec-item">
                        <span className="spec-label">Kilometres</span>
                        <span className="spec-value">{car.odometerKm.toLocaleString('en-IN')} km</span>
                      </div>
                      <div className="spec-item">
                        <span className="spec-label">Fuel</span>
                        <span className="spec-value">{car.fuelType}</span>
                      </div>
                      <div className="spec-item">
                        <span className="spec-label">Transmission</span>
                        <span className="spec-value">{car.transmission}</span>
                      </div>
                    </div>

                    {car.conditionSummary && (
                      <p className="car-condition-snippet">{car.conditionSummary}</p>
                    )}

                    <div className="car-card-footer">
                      <button
                        type="button"
                        className={`btn ${isBooked ? 'btn-card-booked' : 'btn-outline'} btn-block`}
                        onClick={() => onSelectCar(item)}
                      >
                        {isBooked ? (
                          <>
                            <span className="booked-check-icon">✓</span>
                            <span>Drive Booked · View Details</span>
                          </>
                        ) : (
                          <>
                            <span>View Details & Request Drive</span>
                            <span aria-hidden="true">→</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
