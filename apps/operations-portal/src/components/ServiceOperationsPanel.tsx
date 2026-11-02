import React, { useState, useEffect, type FC, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { api } from '../api';
import type { Branch, ServiceJobItem, ServiceJobStatus } from '../types';
import { IconCheck, IconCross, IconRefresh, IconSearch, IconService } from '../icons';

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

interface ServiceOperationsPanelProps {
  user: User;
  branches: Branch[];
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const ServiceOperationsPanel: FC<ServiceOperationsPanelProps> = ({
  user,
  branches,
  onError,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<ServiceJobItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeJob, setActiveJob] = useState<ServiceJobItem | null>(null);
  const [actionTab, setActionTab] = useState<'details' | 'schedule' | 'dispatch' | 'custody' | 'estimate' | 'qc' | 'return' | 'payment'>('details');

  // Action form states
  const [actionBusy, setActionBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleSlot, setScheduleSlot] = useState('10:00 - 12:00');
  const [dispatchDriverId, setDispatchDriverId] = useState('');
  const [dispatchType, setDispatchType] = useState<'PICKUP' | 'RETURN'>('PICKUP');

  // Custody
  const [intakeOdometer, setIntakeOdometer] = useState<number>(0);
  const [intakeFuel, setIntakeFuel] = useState<number>(50);
  const [intakeNotes, setIntakeNotes] = useState('');

  // Estimate
  const [estimateLines, setEstimateLines] = useState<
    Array<{ itemType: string; description: string; quantity: number; unitRateRupees: number }>
  >([
    { itemType: 'LABOUR', description: 'Standard Periodic Inspection & Labor', quantity: 1, unitRateRupees: 1500 },
    { itemType: 'PART', description: 'Synthetic Engine Oil (3.5L)', quantity: 1, unitRateRupees: 2800 },
    { itemType: 'PART', description: 'OEM Oil Filter Cartridge', quantity: 1, unitRateRupees: 450 },
  ]);
  const [estimateNotes, setEstimateNotes] = useState('');

  // QC
  const [qcPassed, setQcPassed] = useState(true);
  const [qcNotes, setQcNotes] = useState('All 24 safety checkpoints and fluids checked. Road test verified.');

  // Return
  const [returnOdometer, setReturnOdometer] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState('Vehicle delivered to customer with invoice and warranty booklet.');

  // Payment
  const [paymentAmountRupees, setPaymentAmountRupees] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentTxRef, setPaymentTxRef] = useState('');

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await api.serviceQueue(user, {
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        hubId: selectedHubId || undefined,
        search: searchQuery.trim() || undefined,
      });
      setJobs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      onError(err?.message || 'Failed to load service queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, [statusFilter, selectedHubId]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void loadQueue();
  };

  const openJobModal = (job: ServiceJobItem) => {
    setActiveJob(job);
    setActionTab('details');
    setIntakeOdometer(job.vehicle?.year ? 45000 : 0);
    setReturnOdometer(job.vehicle?.year ? 45010 : 0);
    const est = job.estimates?.[0];
    if (est) {
      setPaymentAmountRupees(Number(BigInt(est.totalAmountPaise || '0') / 100n));
    }
  };

  // Actions
  const handleScheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.scheduleServiceJob(user, activeJob.id, {
        scheduledDate: scheduleDate || new Date().toISOString().split('T')[0],
        scheduledTimeSlot: scheduleSlot,
      });
      onSuccess(`Job ${activeJob.requestNumber} scheduled for ${scheduleDate || 'today'} (${scheduleSlot})`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to schedule appointment');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDispatchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.dispatchServiceJob(user, activeJob.id, {
        driverId: dispatchDriverId.trim() || undefined,
        type: dispatchType,
      });
      onSuccess(`Driver assigned and dispatched for ${dispatchType.toLowerCase()} of ${activeJob.requestNumber}`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to dispatch pickup/delivery driver');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCustodySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.recordServiceCustody(user, activeJob.id, {
        intakeType: activeJob.fulfillmentType === 'DOORSTEP_PICKUP' ? 'DOORSTEP_HANDOVER' : 'WORKSHOP_DROP',
        odometerKm: Number(intakeOdometer),
        fuelPercent: Number(intakeFuel),
        exteriorNotes: intakeNotes || 'Visual inspection complete. No major dents observed.',
        handoverByPerson: activeJob.customer?.displayName || 'Customer Handover',
      });
      onSuccess(`Custody confirmed for ${activeJob.requestNumber}. Vehicle intake documented.`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to record vehicle custody');
    } finally {
      setActionBusy(false);
    }
  };

  const handleEstimateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      const items = estimateLines.map(line => {
        let cat = (line.itemType || 'PARTS').toUpperCase();
        if (cat === 'PART') cat = 'PARTS';
        if (cat === 'CONSUMABLE') cat = 'CONSUMABLES';
        return {
          category: cat,
          itemType: cat,
          description: line.description,
          quantity: line.quantity,
          unitPricePaise: line.unitRateRupees * 100,
          unitRatePaise: line.unitRateRupees * 100,
          isMandatory: true,
        };
      });
      await api.createServiceEstimate(user, activeJob.id, {
        items,
        notes: estimateNotes || 'Approved V MOTIV OEM parts & labour rates.',
        customerNotes: estimateNotes || 'Approved V MOTIV OEM parts & labour rates.',
      });
      onSuccess(`Itemized estimate submitted for customer approval on ${activeJob.requestNumber}`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to create service estimate');
    } finally {
      setActionBusy(false);
    }
  };

  const handleQcSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.recordServiceQc(user, activeJob.id, {
        result: qcPassed ? 'PASS' : 'REWORK_REQUIRED',
        isPassed: qcPassed,
        notes: qcNotes,
        checklistNotes: qcNotes,
        reworkReason: qcPassed ? undefined : (qcNotes || 'Rework required by technician before release'),
        checklistResults: {
          'safety_checkpoints': true,
          'fluids_and_filters': true,
          'road_test_verified': true,
        },
      });
      onSuccess(`Quality Control ${qcPassed ? 'PASSED' : 'FLAGGED REWORK'} for ${activeJob.requestNumber}`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to record QC decision');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.recordServiceReturn(user, activeJob.id, {
        type: 'CHECK_OUT',
        odometerKm: Number(returnOdometer),
        returnOdometerKm: Number(returnOdometer),
        fuelChargeLevel: '50%',
        fuelPercent: 50,
        preExistingDamageNotes: returnNotes || 'Vehicle delivered with invoice and warranty booklet.',
        returnNotes: returnNotes || 'Vehicle delivered with invoice and warranty booklet.',
        handoverByPerson: activeJob.customer?.displayName || 'Customer Pickup / Delivery',
        customerAcknowledged: true,
        customerSigned: true,
      });
      onSuccess(`Vehicle for ${activeJob.requestNumber} delivered and closed successfully.`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to release vehicle return');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    if (!paymentAmountRupees || paymentAmountRupees <= 0) {
      onError('Please enter a valid payment amount greater than ₹0.');
      return;
    }
    setActionBusy(true);
    try {
      await api.recordServicePayment(user, activeJob.id, {
        type: 'FINAL_SETTLEMENT',
        amountPaise: Math.round(paymentAmountRupees * 100),
        paymentMethod,
        paymentGateway: paymentMethod,
        transactionReference: paymentTxRef || `OFFLINE-${Date.now()}`,
        gatewayPaymentId: paymentTxRef || `OFFLINE-${Date.now()}`,
        notes: 'Collected at workshop delivery counter.',
      });
      onSuccess(`Payment of ₹${paymentAmountRupees.toLocaleString('en-IN')} recorded for Finance verification.`);
      setActiveJob(null);
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to record payment');
    } finally {
      setActionBusy(false);
    }
  };

  const statusBadgeClass = (status: ServiceJobStatus) => {
    switch (status) {
      case 'DELIVERED':
        return 'badge-success';
      case 'READY_FOR_DELIVERY':
      case 'QC_PENDING':
        return 'badge-info';
      case 'IN_PROGRESS':
      case 'ESTIMATE_PENDING':
      case 'DIAGNOSIS_PENDING':
        return 'badge-warning';
      case 'CANCELLED':
        return 'badge-danger';
      case 'SUBMITTED':
      case 'REQUESTED':
      case 'AWAITING_DISPATCH':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div className="tab-pane active">
      {/* Top Header */}
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconService /> Car Service & Workshop Operations
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Real-time workshop bookings, technician job cards, diagnostic estimates, QC sign-offs, and vehicle release.
          </p>
        </div>
        <button type="button" className="btn-secondary button secondary" onClick={() => void loadQueue()} disabled={loading}>
          <IconRefresh /> Refresh
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Bookings</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--text)' }}>{total}</div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>In Workshop</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent)' }}>
            {jobs.filter(j => ['VEHICLE_RECEIVED', 'DIAGNOSIS_PENDING', 'IN_PROGRESS'].includes(j.status)).length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Estimates Pending</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--warning, #f59e0b)' }}>
            {jobs.filter(j => j.status === 'ESTIMATE_PENDING').length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Delivery Ready</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--success, #10b981)' }}>
            {jobs.filter(j => j.status === 'READY_FOR_DELIVERY').length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              className="input"
              placeholder="Search by job #, customer, car model, registration..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2rem' }}
            />
            <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>
              <IconSearch />
            </span>
          </div>
          <button type="submit" className="btn-secondary button secondary">Search</button>
        </form>

        <select
          className="select"
          value={selectedHubId}
          onChange={e => setSelectedHubId(e.target.value)}
          style={{ minWidth: '180px' }}
        >
          <option value="">All Service Hubs</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
          ))}
        </select>
      </div>

      {/* Status Filter Tabs */}
      <div className="filter-chips-bar">
        {[
          'ALL',
          'REQUESTED',
          'AWAITING_DISPATCH',
          'VEHICLE_RECEIVED',
          'DIAGNOSIS_PENDING',
          'ESTIMATE_PENDING',
          'IN_PROGRESS',
          'QC_PENDING',
          'READY_FOR_DELIVERY',
          'DELIVERED',
          'CANCELLED',
        ].map(status => (
          <button
            key={status}
            type="button"
            className={`filter-chip ${statusFilter === status ? 'active' : ''}`}
            onClick={() => setStatusFilter(status)}
          >
            {status.replace(/_/g, ' ').toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table of Jobs */}
      <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <table>
          <thead>
            <tr>
              <th>Job # & Date</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>Category & Fulfillment</th>
              <th>Scheduled Slot</th>
              <th>Estimate</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>Loading service queue…</td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  No service jobs matching current filters.
                </td>
              </tr>
            ) : (
              jobs.map(job => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.requestNumber}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(job.createdAt)}</div>
                  </td>
                  <td>
                    <div><strong>{job.customer?.displayName || 'Customer'}</strong></div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{job.customer?.phone || job.customer?.email || '—'}</div>
                  </td>
                  <td>
                    <div><strong>{job.vehicle?.make} {job.vehicle?.model} ({job.vehicle?.year || '—'})</strong></div>
                    <span className="code-pill" style={{ fontSize: '0.75rem' }}>{job.vehicle?.registrationNumber || 'No Plate'}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      {job.categoryKey.replace(/_/g, ' ')}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {job.fulfillmentType === 'DOORSTEP_PICKUP' ? '🚗 Doorstep Pickup' : '🏢 Hub Drop'}
                    </div>
                  </td>
                  <td>
                    <div>{job.scheduledDate}</div>
                    <small style={{ color: 'var(--muted)' }}>{job.scheduledTimeSlot}</small>
                  </td>
                  <td className="money">
                    {formatRupees(job.estimates?.[0]?.totalAmountPaise)}
                  </td>
                  <td>
                    <span className={`badge ${statusBadgeClass(job.status)}`}>
                      {job.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-primary btn-gold btn-sm button primary small"
                      onClick={() => openJobModal(job)}
                    >
                      Manage Job
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Service Job Drawer Modal */}
      {activeJob && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-dialog" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="eyebrow">JOB MANAGEMENT</span>
                <h3 style={{ margin: 0 }}>
                  {activeJob.requestNumber} — {activeJob.vehicle?.make} {activeJob.vehicle?.model}
                </h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setActiveJob(null)}>
                <IconCross />
              </button>
            </div>

            {/* Sub-Action Tabs */}
            <div className="stepper-nav">
              {[
                { id: 'details', label: 'Overview' },
                { id: 'schedule', label: '1. Schedule' },
                { id: 'dispatch', label: '2. Dispatch' },
                { id: 'custody', label: '3. Intake & Custody' },
                { id: 'estimate', label: '4. Estimate & Parts' },
                { id: 'qc', label: '5. Quality Control' },
                { id: 'return', label: '6. Release & Return' },
                { id: 'payment', label: '7. Payment' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`stepper-tab ${actionTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActionTab(tab.id as any)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="modal-body" style={{ padding: '1.25rem' }}>
              {/* TAB 1: DETAILS */}
              {actionTab === 'details' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>CUSTOMER DETAILS</span>
                      <div><strong>{activeJob.customer?.displayName || 'Customer'}</strong></div>
                      <div>Phone: {activeJob.customer?.phone || '—'}</div>
                      <div>Email: {activeJob.customer?.email || '—'}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>VEHICLE SPECIFICATIONS</span>
                      <div><strong>{activeJob.vehicle?.make} {activeJob.vehicle?.model} {activeJob.vehicle?.variant || ''}</strong></div>
                      <div>Year: {activeJob.vehicle?.year || '—'} · Fuel: {activeJob.vehicle?.fuelType || 'Petrol'}</div>
                      <div>Reg Plate: <span className="code-pill">{activeJob.vehicle?.registrationNumber || '—'}</span></div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>LOGISTICS & HUB</span>
                      <div><strong>{activeJob.hub?.name || 'Local Hub'} ({activeJob.hub?.city})</strong></div>
                      <div>Fulfillment: {activeJob.fulfillmentType === 'DOORSTEP_PICKUP' ? 'Doorstep Pickup' : 'Self Drop'}</div>
                      {activeJob.pickupAddress && <div style={{ fontSize: '0.8rem' }}>Pickup: {activeJob.pickupAddress}</div>}
                    </div>
                  </div>

                  {activeJob.customerNotes && (
                    <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(247, 181, 3, 0.1)', borderRadius: '6px', borderLeft: '3px solid var(--accent)' }}>
                      <strong>Customer Symptoms & Complaints:</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>{activeJob.customerNotes}</p>
                    </div>
                  )}

                  {activeJob.custodyRecord && (
                    <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
                      <strong>Recorded Vehicle Intake Custody:</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                        Odometer: {activeJob.custodyRecord.odometerKm} km · Fuel Level: {activeJob.custodyRecord.fuelPercent}%
                      </div>
                      {activeJob.custodyRecord.exteriorNotes && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                          Condition: {activeJob.custodyRecord.exteriorNotes}
                        </div>
                      )}
                    </div>
                  )}

                  {activeJob.estimates?.[0] && (
                    <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>Service Estimate #{activeJob.estimates[0].id.slice(0, 8)}</strong>
                        <span className={`badge ${activeJob.estimates[0].status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                          {activeJob.estimates[0].status}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
                        {formatRupees(activeJob.estimates[0].totalAmountPaise)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SCHEDULE */}
              {actionTab === 'schedule' && (
                <form onSubmit={handleScheduleSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Confirm or reschedule workshop slot and assign an authorized Service Advisor to this job.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Scheduled Date *</label>
                      <input
                        type="date"
                        className="input"
                        required
                        defaultValue={activeJob.scheduledDate || new Date().toISOString().split('T')[0]}
                        onChange={e => setScheduleDate(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Time Slot *</label>
                      <select
                        className="select"
                        value={scheduleSlot}
                        onChange={e => setScheduleSlot(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        <option value="09:00 - 11:00">09:00 - 11:00 AM</option>
                        <option value="11:00 - 13:00">11:00 AM - 01:00 PM</option>
                        <option value="14:00 - 16:00">02:00 - 04:00 PM</option>
                        <option value="16:00 - 18:00">04:00 - 06:00 PM</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Scheduling…' : 'Confirm Appointment Slot'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 3: DISPATCH */}
              {actionTab === 'dispatch' && (
                <form onSubmit={handleDispatchSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Dispatch a verified field driver for doorstep vehicle collection or return delivery.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Dispatch Type *</label>
                      <select
                        className="select"
                        value={dispatchType}
                        onChange={e => setDispatchType(e.target.value as any)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        <option value="PICKUP">Doorstep Pickup</option>
                        <option value="RETURN">Return Delivery</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Assigned Driver Employee ID *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. driver-emp-01 or leave blank for self"
                        value={dispatchDriverId}
                        onChange={e => setDispatchDriverId(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Dispatching…' : 'Dispatch Driver'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: CUSTODY INTAKE */}
              {actionTab === 'custody' && (
                <form onSubmit={handleCustodySubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Formal legal custody handover. Record exact odometer reading, fuel percentage, and initial exterior damage report.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Intake Odometer (km) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        value={intakeOdometer}
                        onChange={e => setIntakeOdometer(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Fuel / Battery Level (%) *</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        max={100}
                        required
                        value={intakeFuel}
                        onChange={e => setIntakeFuel(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Exterior Condition & Existing Scratches / Dents</label>
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Note existing scratches, windshield chips, tyre tread condition..."
                      value={intakeNotes}
                      onChange={e => setIntakeNotes(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Recording Intake…' : 'Confirm Custody Intake'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 5: ESTIMATE */}
              {actionTab === 'estimate' && (
                <form onSubmit={handleEstimateSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Itemized estimate creation. Every line requires an explicit description, unit rate, and quantity. Customer approval is required before execution.
                  </p>

                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 140px', gap: '0.5rem', fontWeight: 600, fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '4px' }}>
                      <span>TYPE</span>
                      <span>DESCRIPTION</span>
                      <span>QTY</span>
                      <span>RATE (₹)</span>
                    </div>
                    {estimateLines.map((line, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 140px', gap: '0.5rem', marginBottom: '6px' }}>
                        <select
                          className="select"
                          value={line.itemType}
                          onChange={e => {
                            const copy = [...estimateLines];
                            copy[idx]!.itemType = e.target.value;
                            setEstimateLines(copy);
                          }}
                        >
                          <option value="LABOUR">Labour</option>
                          <option value="PART">Part</option>
                          <option value="CONSUMABLE">Consumable</option>
                        </select>
                        <input
                          type="text"
                          className="input"
                          value={line.description}
                          onChange={e => {
                            const copy = [...estimateLines];
                            copy[idx]!.description = e.target.value;
                            setEstimateLines(copy);
                          }}
                        />
                        <input
                          type="number"
                          className="input"
                          min={1}
                          value={line.quantity}
                          onChange={e => {
                            const copy = [...estimateLines];
                            copy[idx]!.quantity = Number(e.target.value);
                            setEstimateLines(copy);
                          }}
                        />
                        <input
                          type="number"
                          className="input"
                          min={0}
                          value={line.unitRateRupees}
                          onChange={e => {
                            const copy = [...estimateLines];
                            copy[idx]!.unitRateRupees = Number(e.target.value);
                            setEstimateLines(copy);
                          }}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary btn-sm button secondary small"
                      style={{ marginTop: '6px' }}
                      onClick={() => setEstimateLines([...estimateLines, { itemType: 'PART', description: '', quantity: 1, unitRateRupees: 500 }])}
                    >
                      + Add Estimate Item
                    </button>
                  </div>

                  {/* Summary calculation */}
                  <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: '6px', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Subtotal: ₹{estimateLines.reduce((acc, l) => acc + (l.quantity * l.unitRateRupees), 0).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Estimated GST (18%): ₹{Math.round(estimateLines.reduce((acc, l) => acc + (l.quantity * l.unitRateRupees), 0) * 0.18).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>
                      Grand Total: ₹{Math.round(estimateLines.reduce((acc, l) => acc + (l.quantity * l.unitRateRupees), 0) * 1.18).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Submitting…' : 'Submit Itemized Estimate for Approval'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 6: QC */}
              {actionTab === 'qc' && (
                <form onSubmit={handleQcSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Independent Quality Control sign-off before vehicle release. Technician work orders must be validated.
                  </p>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="qcDecision"
                        checked={qcPassed}
                        onChange={() => setQcPassed(true)}
                      />
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>PASS — Ready for Delivery</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="qcDecision"
                        checked={!qcPassed}
                        onChange={() => setQcPassed(false)}
                      />
                      <span style={{ fontWeight: 600, color: 'var(--danger)' }}>REWORK REQUIRED — Reject to Technician</span>
                    </label>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>QC Inspection Notes *</label>
                    <textarea
                      className="input"
                      rows={3}
                      required
                      value={qcNotes}
                      onChange={e => setQcNotes(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Saving…' : 'Record QC Decision'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 7: RETURN */}
              {actionTab === 'return' && (
                <form onSubmit={handleReturnSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Complete delivery release. Document final odometer reading and customer handover acknowledgment.
                  </p>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Release Odometer (km) *</label>
                    <input
                      type="number"
                      className="input"
                      required
                      value={returnOdometer}
                      onChange={e => setReturnOdometer(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Handover Notes</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={returnNotes}
                      onChange={e => setReturnNotes(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Confirming Delivery…' : 'Confirm Vehicle Handover'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 8: PAYMENT */}
              {actionTab === 'payment' && (
                <form onSubmit={handlePaymentSubmit}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    Record offline customer payment at the service counter. Finance officers will verify transaction against bank feeds.
                  </p>
                  {activeJob.estimates?.[0] && (
                    <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: '6px', marginTop: '0.75rem', borderLeft: '3px solid var(--accent)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Approved Estimate Total</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent)', marginTop: '2px' }}>
                        {formatRupees(activeJob.estimates[0].totalAmountPaise)}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Amount Received (₹) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        value={paymentAmountRupees}
                        onChange={e => setPaymentAmountRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Payment Method *</label>
                      <select
                        className="select"
                        value={paymentMethod}
                        onChange={e => setPaymentMethod(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        <option value="UPI">UPI / QR Code</option>
                        <option value="POS_CARD">POS Card Terminal</option>
                        <option value="NEFT">NEFT / RTGS Transfer</option>
                        <option value="CASH">Cash Counter</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>UTR / Bank Reference / Receipt #</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. UPI-UTR-2026110199 or POS slip #"
                      value={paymentTxRef}
                      onChange={e => setPaymentTxRef(e.target.value)}
                      style={{ width: '100%', marginTop: '4px' }}
                    />
                  </div>
                  <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Cancel</button>
                    <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                      {actionBusy ? 'Recording…' : 'Record Service Payment'}
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
