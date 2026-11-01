import React, { useState, useEffect, type FC, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { api } from '../api';
import type { Branch, RentalBookingItem, RentalFleetItem, RentalOperationsSummary } from '../types';
import { IconCheck, IconCross, IconRefresh, IconRentals, IconSearch } from '../icons';

function formatRupees(paise?: string | number | null): string {
  if (paise === undefined || paise === null || paise === '') return '—';
  try {
    const p = typeof paise === 'string' ? BigInt(paise) : BigInt(Math.round(paise));
    const isNeg = p < 0n;
    const abs = isNeg ? -p : p;
    const inr = Number(abs / 100n);
    const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inr);
    return isNeg ? `-${formatted}` : formatted;
  } catch {
    return '—';
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

interface RentalOperationsPanelProps {
  user: User;
  branches: Branch[];
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const RentalOperationsPanel: FC<RentalOperationsPanelProps> = ({
  user,
  branches,
  onError,
  onSuccess,
}) => {
  const [subTab, setSubTab] = useState<'fleet' | 'bookings'>('fleet');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<RentalOperationsSummary | null>(null);
  const [fleet, setFleet] = useState<RentalFleetItem[]>([]);
  const [bookings, setBookings] = useState<RentalBookingItem[]>([]);
  const [hubs, setHubs] = useState<Array<{ id: string; name: string; city: string }>>([]);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');
  const [selectedHubId, setSelectedHubId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [onboardModalOpen, setOnboardModalOpen] = useState(false);
  const [blockModalVehicle, setBlockModalVehicle] = useState<RentalFleetItem | null>(null);
  const [historyModalVehicle, setHistoryModalVehicle] = useState<RentalFleetItem | null>(null);
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<RentalBookingItem | null>(null);
  const [bookingDrawerTab, setBookingDrawerTab] = useState<'overview' | 'kyc' | 'handover' | 'return' | 'extension'>('overview');
  const [actionBusy, setActionBusy] = useState(false);

  // Onboard form state
  const [onboardReg, setOnboardReg] = useState('');
  const [onboardVin, setOnboardVin] = useState('');
  const [onboardMake, setOnboardMake] = useState('Hyundai');
  const [onboardModel, setOnboardModel] = useState('Creta');
  const [onboardVariant, setOnboardVariant] = useState('SX(O) AT');
  const [onboardYear, setOnboardYear] = useState<number>(2024);
  const [onboardHubId, setOnboardHubId] = useState('');
  const [onboardTransmission, setOnboardTransmission] = useState('AUTOMATIC');
  const [onboardFuel, setOnboardFuel] = useState('PETROL');
  const [onboardSeats, setOnboardSeats] = useState<number>(5);
  const [onboardColor, setOnboardColor] = useState('Polar White');
  const [onboardDailyRateRupees, setOnboardDailyRateRupees] = useState<number>(2800);
  const [onboardDepositRupees, setOnboardDepositRupees] = useState<number>(5000);
  const [onboardIncludedKm, setOnboardIncludedKm] = useState<number>(250);
  const [onboardExtraKmRateRupees, setOnboardExtraKmRateRupees] = useState<number>(12);

  // Block form state
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockReason, setBlockReason] = useState('MAINTENANCE');
  const [blockNotes, setBlockNotes] = useState('');

  // Booking Action form states
  const [kycRejectionReason, setKycRejectionReason] = useState('');
  const [handoverOdometer, setHandoverOdometer] = useState<number>(12500);
  const [handoverFuel, setHandoverFuel] = useState<number>(100);
  const [handoverKeyReleased, setHandoverKeyReleased] = useState(true);
  const [handoverNotes, setHandoverNotes] = useState('Clean car, full tank fuel verified.');

  const [returnOdometer, setReturnOdometer] = useState<number>(12850);
  const [returnFuel, setReturnFuel] = useState<number>(90);
  const [returnKeyReceived, setReturnKeyReceived] = useState(true);
  const [returnExcessKm, setReturnExcessKm] = useState<number>(0);
  const [returnExcessKmChargeRupees, setReturnExcessKmChargeRupees] = useState<number>(0);
  const [returnDamageChargeRupees, setReturnDamageChargeRupees] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState('Vehicle returned in good condition. No visible damages.');

  const loadData = async () => {
    setLoading(true);
    try {
      const [hubsList, sum, flt, bks] = await Promise.all([
        api.rentalHubs(user).catch(() => []),
        api.rentalSummary(user).catch(() => ({ activeFleet: 0, activeBookings: 0, pendingKyc: 0, returnsDueToday: 0 })),
        api.rentalFleet(user, { hubId: selectedHubId || undefined }),
        api.rentalBookings(user, {
          hubId: selectedHubId || undefined,
          status: bookingStatusFilter !== 'ALL' ? bookingStatusFilter : undefined,
        }),
      ]);
      if (hubsList && hubsList.length > 0) {
        setHubs(hubsList);
      }
      setSummary(sum);
      setFleet(flt || []);
      setBookings(bks || []);
      if (!onboardHubId) {
        setOnboardHubId(hubsList?.[0]?.id || branches[0]?.id || '');
      }
    } catch (err: any) {
      onError(err?.message || 'Failed to load rental operations data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedHubId, bookingStatusFilter]);

  // Handle Onboard Fleet
  const handleOnboardSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    try {
      const reg = onboardReg.toUpperCase().replace(/\s/g, '');
      const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      await api.createRentalFleetVehicle(user, {
        fleetNumber: `VMF-${Math.floor(100 + Math.random() * 899)}`,
        registrationNumber: reg,
        vin: onboardVin.toUpperCase().replace(/\s/g, '') || `VIN-RENTAL-${Date.now()}`,
        make: onboardMake,
        model: onboardModel,
        variant: onboardVariant || undefined,
        year: Number(onboardYear),
        hubId: onboardHubId || branches[0]?.id || '',
        transmission: onboardTransmission,
        fuelType: onboardFuel,
        seats: Number(onboardSeats),
        color: onboardColor,
        baseDailyRatePaise: onboardDailyRateRupees * 100,
        baseHourlyRatePaise: Math.round(onboardDailyRateRupees * 100 / 10),
        securityDepositPaise: onboardDepositRupees * 100,
        includedKmPerDay: Number(onboardIncludedKm) || 250,
        includedDailyKm: Number(onboardIncludedKm) || 250,
        extraKmRatePaise: onboardExtraKmRateRupees * 100,
        commercialPermitNumber: `KA-COMM-${reg.slice(-4) || 'RENTAL'}`,
        commercialPermitExpiry: oneYear,
        insurancePolicyNumber: `POL-VM-${reg.slice(-4) || 'RENTAL'}`,
        insuranceExpiry: oneYear,
        fitnessCertExpiry: oneYear,
        images: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1200&q=80'],
      });
      onSuccess(`Successfully onboarded ${onboardMake} ${onboardModel} (${reg}) to rental fleet.`);
      setOnboardModalOpen(false);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to onboard rental fleet vehicle');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Availability Block
  const handleBlockSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!blockModalVehicle) return;
    setActionBusy(true);
    try {
      await api.createRentalBlock(user, blockModalVehicle.id, {
        startTime: blockStart ? new Date(blockStart).toISOString() : new Date().toISOString(),
        endTime: blockEnd ? new Date(blockEnd).toISOString() : new Date(Date.now() + 86400000).toISOString(),
        reason: blockReason,
        notes: blockNotes,
      });
      onSuccess(`Availability block created for ${blockModalVehicle.make} ${blockModalVehicle.model}.`);
      setBlockModalVehicle(null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to create availability block');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Release vehicle from maintenance back to AVAILABLE
  const handleReleaseFromMaintenance = async (veh: RentalFleetItem, customNotes?: string) => {
    setActionBusy(true);
    try {
      await api.releaseRentalMaintenance(user, veh.id, customNotes);
      onSuccess(`${veh.make} ${veh.model} (${veh.registrationNumber}) has been released from maintenance to AVAILABLE!`);
      if (historyModalVehicle?.id === veh.id) {
        setHistoryModalVehicle(null);
      }
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to release vehicle from maintenance');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Release specific block early
  const handleReleaseSpecificBlock = async (veh: RentalFleetItem, blockId: string) => {
    setActionBusy(true);
    try {
      await api.releaseRentalBlock(user, veh.id, blockId);
      onSuccess(`Maintenance block ended early and vehicle updated.`);
      setHistoryModalVehicle(prev => {
        if (!prev || prev.id !== veh.id) return prev;
        return {
          ...prev,
          blocks: prev.blocks?.map(b => b.id === blockId ? { ...b, endTime: new Date().toISOString() } : b),
          status: 'AVAILABLE',
          activeBlock: null,
        };
      });
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to release maintenance block');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Delete block
  const handleDeleteSpecificBlock = async (veh: RentalFleetItem, blockId: string) => {
    if (!confirm('Are you sure you want to permanently delete this block record?')) return;
    setActionBusy(true);
    try {
      await api.deleteRentalBlock(user, veh.id, blockId);
      onSuccess(`Maintenance block record deleted.`);
      setHistoryModalVehicle(prev => {
        if (!prev || prev.id !== veh.id) return prev;
        return {
          ...prev,
          blocks: prev.blocks?.filter(b => b.id !== blockId),
        };
      });
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to delete block');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Driver KYC Review
  const handleKycReview = async (decision: 'VERIFIED' | 'REJECTED') => {
    if (!activeBooking) return;
    if (decision === 'REJECTED' && !kycRejectionReason.trim()) {
      onError('Please provide a specific rejection reason for the customer.');
      return;
    }
    setActionBusy(true);
    try {
      await api.reviewRentalKyc(user, activeBooking.id, {
        status: decision,
        rejectionReason: decision === 'REJECTED' ? kycRejectionReason : undefined,
      });
      onSuccess(`Driver KYC ${decision} for booking ${activeBooking.bookingNumber}.`);
      setActiveBooking(null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to update driver KYC review');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Handover
  const handleHandoverSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;
    setActionBusy(true);
    try {
      await api.recordRentalHandover(user, activeBooking.id, {
        odometerKm: Number(handoverOdometer),
        fuelPercent: Number(handoverFuel),
        keyReleased: handoverKeyReleased,
        conditionNotes: handoverNotes,
      });
      onSuccess(`Vehicle handover complete for booking ${activeBooking.bookingNumber}. Trip is now ACTIVE.`);
      setActiveBooking(null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to record vehicle handover');
    } finally {
      setActionBusy(false);
    }
  };

  // Handle Return
  const handleReturnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;
    setActionBusy(true);
    try {
      await api.recordRentalReturn(user, activeBooking.id, {
        odometerKm: Number(returnOdometer),
        fuelPercent: Number(returnFuel),
        keyReceived: returnKeyReceived,
        conditionNotes: returnNotes,
        excessKm: Number(returnExcessKm),
        excessKmChargePaise: returnExcessKmChargeRupees * 100,
        damageChargePaise: returnDamageChargeRupees * 100,
      });
      onSuccess(`Return inspection recorded for booking ${activeBooking.bookingNumber}. Settlement submitted.`);
      setActiveBooking(null);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to record return inspection');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReleaseBlock = async (veh: RentalFleetItem, blockId: string) => {
    setActionBusy(true);
    try {
      await api.releaseRentalBlock(user, veh.id, blockId);
      onSuccess(`Block released — ${veh.make} ${veh.model} restored to AVAILABLE.`);
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to release block');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePublish = async (veh: RentalFleetItem) => {
    setActionBusy(true);
    try {
      const newEligible = veh.isEligibleForRental === false ? true : false;
      await api.updateRentalFleetVehicle(user, veh.id, { isEligibleForRental: newEligible });
      onSuccess(
        newEligible
          ? `${veh.make} ${veh.model} (${veh.registrationNumber}) is now published and bookable by customers!`
          : `${veh.make} ${veh.model} has been delisted from customer rental searches.`
      );
      void loadData();
    } catch (err: any) {
      onError(err?.message || 'Failed to update vehicle publishing status');
    } finally {
      setActionBusy(false);
    }
  };

  // Filtered lists
  const filteredFleet = fleet.filter(f => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.make.toLowerCase().includes(q) ||
      f.model.toLowerCase().includes(q) ||
      f.registrationNumber.toLowerCase().includes(q) ||
      f.fleetNumber.toLowerCase().includes(q)
    );
  });

  const filteredBookings = bookings.filter(b => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.bookingNumber.toLowerCase().includes(q) ||
      b.customer?.displayName?.toLowerCase().includes(q) ||
      b.customer?.phone?.toLowerCase().includes(q) ||
      b.vehicle?.model.toLowerCase().includes(q)
    );
  });

  return (
    <div className="tab-pane active">
      {/* Top Header */}
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconRentals /> Car Rental Fleet & Operations
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Self-drive rental fleet management, driver KYC approval, strict handover inspection, and return settlement.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button type="button" className="btn-secondary button secondary" onClick={() => void loadData()} disabled={loading}>
            <IconRefresh /> Refresh
          </button>
          <button type="button" className="btn-primary btn-gold button primary" onClick={() => setOnboardModalOpen(true)}>
            + Onboard Fleet Car
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Active Fleet Units</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--text)' }}>{summary?.activeFleet ?? fleet.length}</div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Active Trips</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent)' }}>
            {bookings.filter(b => b.status === 'TRIP_ACTIVE' || b.status === 'VEHICLE_COLLECTED').length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Driver KYC Pending</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--warning, #f59e0b)' }}>
            {bookings.filter(b => b.kycStatus === 'PENDING_REVIEW').length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Upcoming Bookings</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--success, #10b981)' }}>
            {bookings.filter(b => b.status === 'CONFIRMED').length}
          </div>
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="sub-tab-group">
        <button
          type="button"
          className={`sub-tab-btn ${subTab === 'fleet' ? 'active' : ''}`}
          onClick={() => setSubTab('fleet')}
        >
          <span>🚗 Rental Fleet Inventory</span>
          <span className="sub-tab-count">{fleet.length}</span>
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${subTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setSubTab('bookings')}
        >
          <span>📋 Rental Bookings & Trips</span>
          <span className="sub-tab-count">{bookings.length}</span>
        </button>
      </div>

      {/* Search and Hub Selector */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <input
            type="text"
            className="input"
            placeholder={subTab === 'fleet' ? "Filter fleet by make, model, plate #..." : "Filter bookings by booking #, customer, car..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '2.2rem' }}
          />
          <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
            <IconSearch />
          </span>
        </div>

        <select
          className="select"
          value={selectedHubId}
          onChange={e => setSelectedHubId(e.target.value)}
          style={{ minWidth: '200px' }}
        >
          <option value="">All Operating Hubs</option>
          {(hubs.length > 0 ? hubs : branches).map(b => (
            <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
          ))}
        </select>
      </div>

      {/* VIEW A: FLEET INVENTORY */}
      {subTab === 'fleet' && (
        <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <table>
            <thead>
              <tr>
                <th>Fleet # & Plate</th>
                <th>Vehicle Model</th>
                <th>Hub</th>
                <th>Specs</th>
                <th>Daily Rate</th>
                <th>Deposit</th>
                <th>Status</th>
                <th>Market Visibility</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Loading rental fleet…</td>
                </tr>
              ) : filteredFleet.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                    No rental fleet vehicles found. Click "+ Onboard Fleet Car" to enroll vehicles into the self-drive fleet.
                  </td>
                </tr>
              ) : (
                filteredFleet.map(veh => {
                  const isPublished = veh.isEligibleForRental !== false && veh.status === 'AVAILABLE';
                  const includedKm = veh.includedKmPerDay ?? veh.includedDailyKm ?? 250;
                  return (
                    <tr key={veh.id}>
                      <td>
                        <strong>{veh.fleetNumber}</strong>
                        <div><span className="code-pill">{veh.registrationNumber}</span></div>
                      </td>
                      <td>
                        <div><strong>{veh.make} {veh.model}</strong> {veh.variant || ''}</div>
                        <small style={{ color: 'var(--muted)' }}>Year {veh.year} · {veh.color}</small>
                      </td>
                      <td>
                        <div><strong>{veh.hub?.name || 'Local Hub'}</strong></div>
                        <small style={{ color: 'var(--muted)' }}>{veh.hub?.city || 'Bengaluru'}</small>
                      </td>
                      <td>
                        <div>{veh.transmission} · {veh.fuelType}</div>
                        <small style={{ color: 'var(--muted)' }}>{veh.seats} Seats · {includedKm} km/day</small>
                      </td>
                      <td className="money" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        {formatRupees(veh.baseDailyRatePaise)}/day
                      </td>
                      <td className="money">
                        {formatRupees(veh.securityDepositPaise)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                          <span
                            className={`badge ${
                              veh.status === 'AVAILABLE' ? 'badge-success' :
                              veh.status === 'RENTED' ? 'badge-info' :
                              veh.status === 'MAINTENANCE' ? 'badge-warning' :
                              veh.status === 'CLEANING' ? 'badge-warning' : 'badge-danger'
                            }`}
                            style={{
                              cursor: (veh.status === 'MAINTENANCE' || veh.status === 'CLEANING' || (veh.blocks && veh.blocks.length > 0)) ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                              if (veh.status === 'MAINTENANCE' || veh.status === 'CLEANING' || (veh.blocks && veh.blocks.length > 0)) {
                                setHistoryModalVehicle(veh);
                              }
                            }}
                            title="Click to view maintenance history & buffer records"
                          >
                            {veh.status === 'AVAILABLE' ? '● AVAILABLE' :
                             veh.status === 'MAINTENANCE' ? '● MAINTENANCE' :
                             veh.status === 'CLEANING' ? '● CLEANING' : veh.status}
                          </span>
                          {veh.activeBlock && (
                            <div style={{ marginTop: '2px' }}>
                              <span style={{ fontSize: '0.6875rem', color: '#fbbf24', fontWeight: 700 }}>
                                {veh.activeBlock.reason.replace(/_/g, ' ')}
                              </span>
                              <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
                                Until {formatDate(veh.activeBlock.endTime)}
                              </div>
                            </div>
                          )}
                          {veh.blocks && veh.blocks.length > 0 && !veh.activeBlock && (
                            <button
                              type="button"
                              onClick={() => setHistoryModalVehicle(veh)}
                              style={{ fontSize: '0.6875rem', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                            >
                              {veh.blocks.length} service record{veh.blocks.length > 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {isPublished ? (
                          <div>
                            <span className="badge badge-success" style={{ gap: 4 }}>
                              <span>✓</span> Published
                            </span>
                            <small style={{ display: 'block', fontSize: '0.6875rem', color: '#34d399', marginTop: 2 }}>
                              Live on App & Web
                            </small>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-neutral" style={{ gap: 4 }}>
                              <span>⏸</span> Off-market
                            </span>
                            <small style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--muted)', marginTop: 2 }}>
                              {veh.status !== 'AVAILABLE' ? veh.status : 'Delisted'}
                            </small>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* Direct Release to Available action if in Maintenance / Cleaning */}
                          {(veh.status === 'MAINTENANCE' || veh.status === 'CLEANING' || veh.activeBlock) && (
                            <button
                              type="button"
                              className="btn-sm btn-primary button primary small"
                              style={{ background: '#10b981', color: '#061a38', borderColor: '#10b981', fontWeight: 700 }}
                              disabled={actionBusy}
                              onClick={() => void handleReleaseFromMaintenance(veh)}
                              title="End maintenance and restore vehicle to AVAILABLE immediately"
                            >
                              ✓ Release to Available
                            </button>
                          )}

                          <button
                            type="button"
                            className={`btn-sm button small ${isPublished ? 'btn-secondary secondary' : 'btn-gold btn-primary primary'}`}
                            disabled={actionBusy}
                            onClick={() => void handleTogglePublish(veh)}
                            title={isPublished ? 'Delist from customer searches' : 'Publish to customer searches'}
                          >
                            {isPublished ? 'Delist' : 'Publish'}
                          </button>

                          <button
                            type="button"
                            className="btn-secondary btn-sm button secondary small"
                            onClick={() => setHistoryModalVehicle(veh)}
                            title="View start/end dates, reason, notes, and maintenance history"
                          >
                            🛠 History ({veh.blocks?.length || 0})
                          </button>

                          <button
                            type="button"
                            className="btn-secondary btn-sm button secondary small"
                            onClick={() => {
                              setBlockModalVehicle(veh);
                              setBlockStart(new Date().toISOString().slice(0, 16));
                              setBlockEnd(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
                            }}
                            title="Schedule maintenance or turnaround buffer"
                          >
                            + Buffer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW B: BOOKINGS & TRIPS */}
      {subTab === 'bookings' && (
        <div>
          {/* Status filter buttons */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {['ALL', 'CONFIRMED', 'TRIP_ACTIVE', 'RETURN_INSPECTED', 'SETTLED', 'CANCELLED'].map(st => (
              <button
                key={st}
                type="button"
                className={`button small ${bookingStatusFilter === st ? 'primary' : 'secondary'}`}
                style={{ fontSize: '0.75rem' }}
                onClick={() => setBookingStatusFilter(st)}
              >
                {st.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table>
              <thead>
                <tr>
                  <th>Booking # & Date</th>
                  <th>Customer</th>
                  <th>Car Booked</th>
                  <th>Trip Dates (Asia/Kolkata)</th>
                  <th>Total Payable</th>
                  <th>KYC Status</th>
                  <th>Booking Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Loading bookings…</td>
                  </tr>
                ) : filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                      No rental bookings matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map(b => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.bookingNumber}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(b.startTime)}</div>
                      </td>
                      <td>
                        <div><strong>{b.customer?.displayName || 'Customer'}</strong></div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{b.customer?.phone || b.customer?.email || '—'}</div>
                      </td>
                      <td>
                        <div><strong>{b.vehicle?.make} {b.vehicle?.model}</strong></div>
                        <span className="code-pill" style={{ fontSize: '0.75rem' }}>{b.vehicle?.registrationNumber || 'Fleet Vehicle'}</span>
                      </td>
                      <td>
                        <div>{formatDate(b.startTime)}</div>
                        <small style={{ color: 'var(--muted)' }}>to {formatDate(b.endTime)}</small>
                      </td>
                      <td className="money">
                        <strong>{formatRupees(b.totalPayablePaise)}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Dep: {formatRupees(b.securityDepositPaise)}</div>
                      </td>
                      <td>
                        <span className={`badge ${b.kycStatus === 'VERIFIED' ? 'badge-success' : b.kycStatus === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                          {b.kycStatus}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${b.status === 'TRIP_ACTIVE' ? 'badge-info' : b.status === 'CONFIRMED' ? 'badge-success' : 'badge-neutral'}`}>
                          {b.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="button primary small"
                          onClick={() => {
                            setActiveBooking(b);
                            setBookingDrawerTab('overview');
                          }}
                        >
                          Manage Trip
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ONBOARD FLEET CAR */}
      {onboardModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '650px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">FLEET ENROLLMENT</span>
                <h3 style={{ margin: 0 }}>Onboard New Self-Drive Rental Vehicle</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setOnboardModalOpen(false)}>
                <IconCross />
              </button>
            </div>
            <form onSubmit={handleOnboardSubmit}>
              <div className="modal-body" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                  Register a legally compliant commercial self-drive vehicle into the V MOTIV rental fleet.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Registration Number *</label>
                    <input
                      type="text"
                      className="input font-mono"
                      required
                      placeholder="e.g. KA01MK1234"
                      value={onboardReg}
                      onChange={e => setOnboardReg(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>VIN / Chassis Number</label>
                    <input
                      type="text"
                      className="input font-mono"
                      placeholder="Optional or leave blank"
                      value={onboardVin}
                      onChange={e => setOnboardVin(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Make *</label>
                    <input
                      type="text"
                      className="input"
                      required
                      value={onboardMake}
                      onChange={e => setOnboardMake(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Model *</label>
                    <input
                      type="text"
                      className="input"
                      required
                      value={onboardModel}
                      onChange={e => setOnboardModel(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Variant</label>
                    <input
                      type="text"
                      className="input"
                      value={onboardVariant}
                      onChange={e => setOnboardVariant(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Manufacturing Year *</label>
                    <input
                      type="number"
                      className="input"
                      required
                      value={onboardYear}
                      onChange={e => setOnboardYear(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Assigned Operating Hub *</label>
                    <select
                      className="select"
                      required
                      value={onboardHubId}
                      onChange={e => setOnboardHubId(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      {(hubs.length > 0 ? hubs : branches).map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Transmission *</label>
                    <select
                      className="select"
                      value={onboardTransmission}
                      onChange={e => setOnboardTransmission(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      <option value="AUTOMATIC">Automatic</option>
                      <option value="MANUAL">Manual</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Fuel Type *</label>
                    <select
                      className="select"
                      value={onboardFuel}
                      onChange={e => setOnboardFuel(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      <option value="PETROL">Petrol</option>
                      <option value="DIESEL">Diesel</option>
                      <option value="EV">Electric (EV)</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="CNG">CNG</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Seats *</label>
                    <input
                      type="number"
                      className="input"
                      min={2}
                      max={9}
                      value={onboardSeats}
                      onChange={e => setOnboardSeats(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Daily Base Rate (₹) *</label>
                    <input
                      type="number"
                      className="input"
                      required
                      min={500}
                      value={onboardDailyRateRupees}
                      onChange={e => setOnboardDailyRateRupees(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Refundable Security Deposit (₹) *</label>
                    <input
                      type="number"
                      className="input"
                      required
                      min={0}
                      value={onboardDepositRupees}
                      onChange={e => setOnboardDepositRupees(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Included Daily Km *</label>
                    <input
                      type="number"
                      className="input"
                      required
                      value={onboardIncludedKm}
                      onChange={e => setOnboardIncludedKm(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Extra Km Rate (₹/km) *</label>
                    <input
                      type="number"
                      className="input"
                      required
                      value={onboardExtraKmRateRupees}
                      onChange={e => setOnboardExtraKmRateRupees(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary button secondary" onClick={() => setOnboardModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                  {actionBusy ? 'Onboarding…' : 'Enroll into Fleet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD AVAILABILITY BLOCK */}
      {blockModalVehicle && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '500px', width: '95%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">AVAILABILITY BUFFER</span>
                <h3 style={{ margin: 0 }}>Block {blockModalVehicle.make} {blockModalVehicle.model}</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setBlockModalVehicle(null)}>
                <IconCross />
              </button>
            </div>
            <form onSubmit={handleBlockSubmit}>
              <div className="modal-body" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                  Prevent customer rental reservations during this maintenance or detailing period.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Start Date/Time *</label>
                    <input
                      type="datetime-local"
                      className="input"
                      required
                      value={blockStart}
                      onChange={e => setBlockStart(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>End Date/Time *</label>
                    <input
                      type="datetime-local"
                      className="input"
                      required
                      value={blockEnd}
                      onChange={e => setBlockEnd(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Reason for Block *</label>
                  <select
                    className="select"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  >
                    <option value="MAINTENANCE">Routine Maintenance & Servicing</option>
                    <option value="ACCIDENT_REPAIR">Bodyshop / Accident Repair</option>
                    <option value="CLEANING">Deep Cleaning & Turnaround</option>
                    <option value="OPERATIONAL_RESTRICTION">RTO / Commercial Fitness Inspection</option>
                    <option value="BUFFER">Scheduling Buffer</option>
                  </select>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Notes</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. 20,000 km oil service scheduled at Bosch Hub"
                    value={blockNotes}
                    onChange={e => setBlockNotes(e.target.value)}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary button secondary" onClick={() => setBlockModalVehicle(null)}>Cancel</button>
                <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                  {actionBusy ? 'Saving Block…' : 'Create Availability Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MAINTENANCE & BUFFER HISTORY */}
      {historyModalVehicle && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '880px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">VEHICLE SERVICE & MAINTENANCE HISTORY</span>
                <h3 style={{ margin: 0 }}>
                  {historyModalVehicle.make} {historyModalVehicle.model} ({historyModalVehicle.registrationNumber}) — Fleet #{historyModalVehicle.fleetNumber}
                </h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setHistoryModalVehicle(null)}>
                <IconCross />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* Active Maintenance Callout Banner */}
              {(historyModalVehicle.status === 'MAINTENANCE' || historyModalVehicle.status === 'CLEANING' || historyModalVehicle.activeBlock) ? (
                <div style={{
                  padding: '1rem 1.25rem',
                  background: 'rgba(247, 181, 3, 0.12)',
                  border: '1px solid rgba(247, 181, 3, 0.45)',
                  borderRadius: '8px',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-warning">● CURRENTLY IN MAINTENANCE</span>
                      <strong style={{ fontSize: '1rem', color: '#fbbf24' }}>
                        {historyModalVehicle.activeBlock?.reason?.replace(/_/g, ' ') || 'Scheduled Service & Maintenance'}
                      </strong>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '4px' }}>
                      <strong>Started:</strong> {historyModalVehicle.activeBlock ? formatDate(historyModalVehicle.activeBlock.startTime) : 'Active'} · 
                      <strong> Scheduled End:</strong> {historyModalVehicle.activeBlock ? formatDate(historyModalVehicle.activeBlock.endTime) : 'Open-ended'}
                    </div>
                    {historyModalVehicle.activeBlock?.notes && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text)', marginTop: '4px' }}>
                        <strong>Notes:</strong> {historyModalVehicle.activeBlock.notes}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-gold button primary"
                    style={{ background: '#10b981', color: '#061a38', borderColor: '#10b981', fontWeight: 700 }}
                    disabled={actionBusy}
                    onClick={() => void handleReleaseFromMaintenance(historyModalVehicle)}
                  >
                    ✓ Release to Available Now
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-success">● AVAILABLE</span>
                    <span style={{ fontSize: '0.875rem' }}>
                      Vehicle is ready and bookable by customers at <strong>{historyModalVehicle.hub?.name || 'Local Hub'}</strong>.
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {historyModalVehicle.isEligibleForRental ? 'Market Visibility: Live' : 'Market Visibility: Delisted'}
                  </span>
                </div>
              )}

              {/* Maintenance Blocks Table */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                  Maintenance & Scheduling Blocks ({historyModalVehicle.blocks?.length || 0})
                </h4>
                <button
                  type="button"
                  className="btn-secondary btn-sm button secondary small"
                  onClick={() => {
                    const veh = historyModalVehicle;
                    setHistoryModalVehicle(null);
                    setBlockModalVehicle(veh);
                    setBlockStart(new Date().toISOString().slice(0, 16));
                    setBlockEnd(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
                  }}
                >
                  + Add New Block
                </button>
              </div>

              {(!historyModalVehicle.blocks || historyModalVehicle.blocks.length === 0) ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  No maintenance blocks or buffer periods recorded for this vehicle yet. All routine servicing, repairs, and turnaround detailing records will appear here.
                </div>
              ) : (
                <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Reason</th>
                        <th>Start Date / Time</th>
                        <th>End Date / Time</th>
                        <th>Notes / Technician Report</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyModalVehicle.blocks.map(block => {
                        const now = new Date();
                        const s = new Date(block.startTime);
                        const e = new Date(block.endTime);
                        const isActive = s <= now && e > now;
                        const isUpcoming = s > now;

                        return (
                          <tr key={block.id}>
                            <td>
                              {isActive ? (
                                <span className="badge badge-warning">● ACTIVE NOW</span>
                              ) : isUpcoming ? (
                                <span className="badge badge-info">● UPCOMING</span>
                              ) : (
                                <span className="badge badge-neutral">✓ COMPLETED</span>
                              )}
                            </td>
                            <td>
                              <strong>{block.reason.replace(/_/g, ' ')}</strong>
                            </td>
                            <td>
                              <div>{formatDate(block.startTime)}</div>
                            </td>
                            <td>
                              <div>{formatDate(block.endTime)}</div>
                            </td>
                            <td style={{ maxWidth: '240px', fontSize: '0.8125rem' }}>
                              {block.notes || <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                {(isActive || isUpcoming) && (
                                  <button
                                    type="button"
                                    className="btn-sm btn-primary button primary small"
                                    style={{ fontSize: '0.72rem', background: '#10b981', color: '#061a38', borderColor: '#10b981', fontWeight: 700 }}
                                    disabled={actionBusy}
                                    onClick={() => void handleReleaseSpecificBlock(historyModalVehicle, block.id)}
                                    title="End this block now and restore vehicle to AVAILABLE"
                                  >
                                    End & Release
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-sm btn-danger button danger small"
                                  style={{ fontSize: '0.72rem' }}
                                  disabled={actionBusy}
                                  onClick={() => void handleDeleteSpecificBlock(historyModalVehicle, block.id)}
                                  title="Delete accidental block record"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary button secondary" onClick={() => setHistoryModalVehicle(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANAGE RENTAL BOOKING DRAWER */}
      {activeBooking && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">RENTAL TRIP DISPATCH</span>
                <h3 style={{ margin: 0 }}>
                  Booking #{activeBooking.bookingNumber} — {activeBooking.vehicle?.make} {activeBooking.vehicle?.model}
                </h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setActiveBooking(null)}>
                <IconCross />
              </button>
            </div>

            {/* Sub-Tabs */}
            <div className="stepper-nav">
              {[
                { id: 'overview', label: 'Trip Overview' },
                { id: 'kyc', label: `1. Driver KYC (${activeBooking.kycStatus})` },
                { id: 'handover', label: '2. Pickup Handover' },
                { id: 'return', label: '3. Return Inspection' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`stepper-tab ${bookingDrawerTab === t.id ? 'active' : ''}`}
                  onClick={() => setBookingDrawerTab(t.id as any)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* TAB 1: OVERVIEW */}
              {bookingDrawerTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>CUSTOMER</span>
                      <div><strong>{activeBooking.customer?.displayName || 'Customer'}</strong></div>
                      <div>Phone: {activeBooking.customer?.phone || '—'}</div>
                      <div>Email: {activeBooking.customer?.email || '—'}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>FLEET CAR</span>
                      <div><strong>{activeBooking.vehicle?.make} {activeBooking.vehicle?.model}</strong></div>
                      <div>Plate: <span className="code-pill">{activeBooking.vehicle?.registrationNumber || '—'}</span></div>
                      <div>Hub: {activeBooking.pickupHub?.name || 'Local Hub'}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>BILLING SUMMARY</span>
                      <div>Total: <strong>{formatRupees(activeBooking.totalPayablePaise)}</strong></div>
                      <div>Security Deposit: <strong>{formatRupees(activeBooking.securityDepositPaise)}</strong></div>
                      <div>Status: <span className="badge badge-info">{activeBooking.status}</span></div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                    <strong>Trip Duration:</strong>
                    <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                      Start: {formatDate(activeBooking.startTime)} → End: {formatDate(activeBooking.endTime)}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: KYC */}
              {bookingDrawerTab === 'kyc' && (
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Verify primary driver government driving license before releasing vehicle keys. Strict KYC is enforced by legal insurance regulations.
                  </p>

                  {activeBooking.driverVerification ? (
                    <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>LICENSE NUMBER</span>
                          <div><strong>{activeBooking.driverVerification.licenseNumber}</strong></div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>VALIDITY EXPIRY</span>
                          <div><strong>{activeBooking.driverVerification.licenseExpiry}</strong></div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>DATE OF BIRTH</span>
                          <div><strong>{activeBooking.driverVerification.dateOfBirth}</strong></div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>DRIVING EXPERIENCE</span>
                          <div><strong>{activeBooking.driverVerification.drivingExperienceYears} Years</strong></div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        {activeBooking.driverVerification.licenseFrontUrl && (
                          <a href={activeBooking.driverVerification.licenseFrontUrl} target="_blank" rel="noreferrer" className="button secondary small">
                            View License Front ↗
                          </a>
                        )}
                        {activeBooking.driverVerification.licenseBackUrl && (
                          <a href={activeBooking.driverVerification.licenseBackUrl} target="_blank" rel="noreferrer" className="button secondary small">
                            View License Back ↗
                          </a>
                        )}
                      </div>

                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          Current Status: <span className={`badge ${activeBooking.kycStatus === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`}>{activeBooking.kycStatus}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn-danger button danger small"
                            disabled={actionBusy}
                            onClick={() => {
                              const reason = prompt('Enter KYC rejection reason:');
                              if (reason) {
                                setKycRejectionReason(reason);
                                void handleKycReview('REJECTED');
                              }
                            }}
                          >
                            Reject KYC
                          </button>
                          <button
                            type="button"
                            className="btn-primary btn-gold button primary small"
                            disabled={actionBusy || activeBooking.kycStatus === 'VERIFIED'}
                            onClick={() => void handleKycReview('VERIFIED')}
                          >
                            {actionBusy ? 'Verifying…' : 'Approve Driver KYC ✓'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '6px', color: 'var(--muted)' }}>
                      Customer has not yet submitted driving license KYC for this booking.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: HANDOVER */}
              {bookingDrawerTab === 'handover' && (
                <form onSubmit={handleHandoverSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Vehicle Key Release. Confirm start odometer, fuel level, and condition before key handover.
                  </p>

                  {activeBooking.kycStatus !== 'VERIFIED' && (
                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '6px', marginBottom: '1rem', borderLeft: '3px solid var(--danger)' }}>
                      <strong>KYC Gate Locked:</strong> Driver KYC must be VERIFIED before physical vehicle keys can be released.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Start Odometer (km) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        value={handoverOdometer}
                        onChange={e => setHandoverOdometer(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Start Fuel Level (%) *</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        max={100}
                        required
                        value={handoverFuel}
                        onChange={e => setHandoverFuel(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={handoverKeyReleased}
                        onChange={e => setHandoverKeyReleased(e.target.checked)}
                      />
                      <span style={{ fontWeight: 600 }}>Physical key and vehicle documents handed over to verified driver</span>
                    </label>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Handover Condition Notes</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={handoverNotes}
                      onChange={e => setHandoverNotes(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>

                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveBooking(null)}>Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary btn-gold button primary"
                      disabled={actionBusy || activeBooking.kycStatus !== 'VERIFIED'}
                    >
                      {actionBusy ? 'Confirming Handover…' : 'Confirm Handover & Start Trip'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: RETURN */}
              {bookingDrawerTab === 'return' && (
                <form onSubmit={handleReturnSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                    Post-trip inspection. Document return odometer, fuel refill charges, and any new damage for deposit reconciliation.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Return Odometer (km) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        value={returnOdometer}
                        onChange={e => setReturnOdometer(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Return Fuel Level (%) *</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        max={100}
                        required
                        value={returnFuel}
                        onChange={e => setReturnFuel(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Excess Kilometres</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        value={returnExcessKm}
                        onChange={e => {
                          const km = Number(e.target.value);
                          setReturnExcessKm(km);
                          setReturnExcessKmChargeRupees(km * 12);
                        }}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Excess Km Charge (₹)</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        value={returnExcessKmChargeRupees}
                        onChange={e => setReturnExcessKmChargeRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Damage Claim Charge (₹)</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        value={returnDamageChargeRupees}
                        onChange={e => setReturnDamageChargeRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '1.75rem' }}>
                        <input
                          type="checkbox"
                          checked={returnKeyReceived}
                          onChange={e => setReturnKeyReceived(e.target.checked)}
                        />
                        <span style={{ fontWeight: 600 }}>Physical keys & vehicle documents received back</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Return Condition & Damage Notes</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={returnNotes}
                      onChange={e => setReturnNotes(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>

                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveBooking(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Saving Return…' : 'Confirm Return & Calculate Settlement'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
