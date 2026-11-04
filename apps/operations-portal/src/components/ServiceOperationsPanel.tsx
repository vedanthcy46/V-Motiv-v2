import React, { useState, useEffect, type FC, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { api } from '../api';
import type { Branch, ServiceJobItem, ServiceJobStatus } from '../types';
import { IconCross, IconRefresh, IconSearch, IconService } from '../icons';
import { CURRENT_YEAR } from '../calendar';

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
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionTab, setActionTab] = useState<'details' | 'schedule' | 'dispatch' | 'custody' | 'estimate' | 'qc' | 'payment' | 'return'>('details');

  // Categories
  const [categories, setCategories] = useState<
    Array<{
      categoryKey: string;
      title: string;
      description: string;
      icon: string;
      fixedPackageAvailable?: boolean;
      packagePricePaise?: string | null;
      pricingType?: string;
      diagnosticFeePaise?: string;
      packageFeatures?: string[];
    }>
  >([]);

  // Dynamic Service Pricing Modal state
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(null);
  const [editPricingHubId, setEditPricingHubId] = useState<string>('all');
  const [editPriceRupees, setEditPriceRupees] = useState<number>(0);
  const [editDiagnosticFeeRupees, setEditDiagnosticFeeRupees] = useState<number>(500);
  const [editPricingType, setEditPricingType] = useState<string>('FIXED');
  const [editPackageAvailable, setEditPackageAvailable] = useState<boolean>(true);
  const [editFeaturesText, setEditFeaturesText] = useState<string>('');
  const [savingCategoryPricing, setSavingCategoryPricing] = useState(false);

  // Final Invoice Generation & Release Readiness
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [readinessData, setReadinessData] = useState<{
    canRelease: boolean;
    reasons: string[];
    gateChecks: {
      qcPassed: boolean;
      estimateApproved: boolean;
      invoiceIssued: boolean;
      paymentSettled: boolean;
    };
    billAmountPaise: string;
    totalVerifiedPaidPaise: string;
    outstandingBalancePaise: string;
  } | null>(null);

  // Walk-in modal state
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInHubId, setWalkInHubId] = useState('');
  const [walkInCustomerName, setWalkInCustomerName] = useState('');
  const [walkInCustomerPhone, setWalkInCustomerPhone] = useState('');
  const [walkInCustomerEmail, setWalkInCustomerEmail] = useState('');
  const [walkInVehicleMake, setWalkInVehicleMake] = useState('');
  const [walkInVehicleModel, setWalkInVehicleModel] = useState('');
  const [walkInVehicleYear, setWalkInVehicleYear] = useState(CURRENT_YEAR);
  const [walkInFuelType, setWalkInFuelType] = useState('PETROL');
  const [walkInTransmission, setWalkInTransmission] = useState('MANUAL');
  const [walkInRegNumber, setWalkInRegNumber] = useState('');
  const [walkInOdometer, setWalkInOdometer] = useState<number>(0);
  const [walkInCategoryKey, setWalkInCategoryKey] = useState('periodic-maintenance');
  const [walkInSymptoms, setWalkInSymptoms] = useState('');
  const [walkInImmediateIntake, setWalkInImmediateIntake] = useState(true);
  const [walkInIntakeNotes, setWalkInIntakeNotes] = useState('');
  const [walkInIntakeFuel, setWalkInIntakeFuel] = useState<number>(50);
  const [walkInCollectPayment, setWalkInCollectPayment] = useState(false);
  const [walkInAdvancePayment, setWalkInAdvancePayment] = useState<number>(0);
  const [walkInPaymentMethod, setWalkInPaymentMethod] = useState<'UPI' | 'POS_CARD' | 'CASH' | 'BANK_TRANSFER'>('UPI');
  const [walkInTxRef, setWalkInTxRef] = useState('');

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
    Array<{ itemType: string; description: string; quantity: number; unitRateRupees: number; isMandatory: boolean }>
  >([{ itemType: 'LABOUR', description: '', quantity: 1, unitRateRupees: 0, isMandatory: true }]);
  const [estimateNotes, setEstimateNotes] = useState('');
  // Revising a declined (or pending) estimate: opens the line editor prefilled with the last version.
  const [reviseMode, setReviseMode] = useState(false);

  // QC
  const [qcPassed, setQcPassed] = useState(true);
  const [qcNotes, setQcNotes] = useState('All 24 safety checkpoints and fluids checked. Road test verified.');

  // Payment
  const [paymentAmountRupees, setPaymentAmountRupees] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentTxRef, setPaymentTxRef] = useState('');
  const [paymentAutoVerify, setPaymentAutoVerify] = useState(true);

  // Return
  const [returnOdometer, setReturnOdometer] = useState<number>(0);
  const [returnNotes, setReturnNotes] = useState('Vehicle delivered to customer with invoice and warranty booklet.');

  // Cancellation state
  const [cancelPromptOpen, setCancelPromptOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Load categories
  useEffect(() => {
    let active = true;
    void api.serviceCategories(user).then(res => {
      if (active && Array.isArray(res) && res.length > 0) {
        setCategories(res);
        if (!walkInCategoryKey) setWalkInCategoryKey(res[0].categoryKey);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);

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

  const openJobModal = async (job: ServiceJobItem) => {
    setActiveJob(job);
    setActionTab('details');
    setLoadingDetails(true);

    if (job.vehicle && typeof (job.vehicle as any).odometerKm === 'number') {
      setIntakeOdometer((job.vehicle as any).odometerKm);
      setReturnOdometer((job.vehicle as any).odometerKm);
    }

    try {
      const full = await api.serviceJobDetails(user, job.id);
      setActiveJob(full);
      if (full.vehicle?.odometerKm) {
        setIntakeOdometer(full.vehicle.odometerKm);
        setReturnOdometer(full.vehicle.odometerKm);
      }
      try {
        const rd = await api.fetchServiceReleaseReadiness(user, job.id);
        setReadinessData(rd);
      } catch {
        // ignore readiness fetch error
      }
    } catch (err) {
      console.warn('Failed to load full job details', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const refreshActiveJob = async (jobId: string) => {
    try {
      const full = await api.serviceJobDetails(user, jobId);
      setActiveJob(full);
      try {
        const rd = await api.fetchServiceReleaseReadiness(user, jobId);
        setReadinessData(rd);
      } catch {
        // ignore
      }
    } catch (e) {
      console.warn('Failed to refresh job', e);
    }
    void loadQueue();
  };

  const handleGenerateInvoice = async () => {
    if (!activeJob) return;
    setGeneratingInvoice(true);
    try {
      const inv = await api.generateServiceInvoice(user, activeJob.id, {});
      onSuccess(`Tax Invoice ${inv.invoiceNumber} generated successfully!`);
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to generate tax invoice');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleSaveCategoryPricing = async (categoryKey: string) => {
    if (!user) return;
    setSavingCategoryPricing(true);
    try {
      const features = editFeaturesText
        .split('\n')
        .map((f: string) => f.trim())
        .filter(Boolean);
      await api.updateServiceCategoryPricing(user, categoryKey, {
        hubId: editPricingHubId === 'all' ? undefined : editPricingHubId,
        pricingType: editPricingType,
        fixedPackageAvailable: editPackageAvailable,
        packagePriceRupees: editPackageAvailable ? editPriceRupees : undefined,
        diagnosticFeeRupees: editDiagnosticFeeRupees,
        packageFeatures: features,
      });
      onSuccess(`Pricing for ${categoryKey} updated successfully.`);
      setEditingCategoryKey(null);
      const cats = await api.serviceCategories(user, editPricingHubId === 'all' ? undefined : editPricingHubId);
      if (Array.isArray(cats)) setCategories(cats);
    } catch (err: any) {
      onError(err?.message || 'Failed to update category pricing');
    } finally {
      setSavingCategoryPricing(false);
    }
  };

  const handleCancelServiceJob = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob || !user || !cancelReason.trim()) return;
    try {
      setCancelling(true);
      await api.serviceCancelJob(user, activeJob.id, { reason: cancelReason.trim() });
      onSuccess(`Service Job ${activeJob.requestNumber} cancelled successfully.`);
      setCancelPromptOpen(false);
      setCancelReason('');
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to cancel service job');
    } finally {
      setCancelling(false);
    }
  };

  const handleScheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.scheduleServiceJob(user, activeJob.id, {
        scheduledDate: scheduleDate || activeJob.scheduledDate,
        scheduledTimeSlot: scheduleSlot || activeJob.scheduledTimeSlot,
      });
      onSuccess(`Appointment for ${activeJob.requestNumber} updated successfully.`);
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to update schedule');
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
      await refreshActiveJob(activeJob.id);
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
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to record vehicle custody');
    } finally {
      setActionBusy(false);
    }
  };

  const handleEstimateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    if (estimateLines.every(l => !(l.unitRateRupees > 0)) || estimateLines.some(l => !l.description.trim())) {
      onError('Every estimate line needs a description, and at least one line must have a price.');
      return;
    }
    setActionBusy(true);
    try {
      const items = estimateLines.map(line => {
        const qty = Math.max(1, line.quantity || 1);
        const unitPaise = Math.round((line.unitRateRupees || 0) * 100);
        return {
          category: line.itemType,
          description: line.description.trim(),
          quantity: qty,
          unitPricePaise: unitPaise,
          totalPricePaise: qty * unitPaise,
          // Required work cannot be deferred by the customer; recommended work can.
          isMandatory: line.isMandatory,
        };
      });

      const subtotalPaise = items.reduce((acc, it) => acc + it.totalPricePaise, 0);
      const cgstPaise = Math.round(subtotalPaise * 0.09);
      const sgstPaise = Math.round(subtotalPaise * 0.09);
      const totalAmountPaise = subtotalPaise + cgstPaise + sgstPaise;

      await api.createServiceEstimate(user, activeJob.id, {
        items,
        subtotalPaise,
        cgstPaise,
        sgstPaise,
        totalAmountPaise,
        customerNotes: estimateNotes.trim() || undefined,
        validDays: 7,
      });

      onSuccess(`${reviseMode ? 'Revised estimate' : 'Estimate'} sent to customer for ${activeJob.requestNumber}.`);
      setReviseMode(false);
      setEstimateNotes('');
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to create service estimate');
    } finally {
      setActionBusy(false);
    }
  };

  /** Open the line editor prefilled with the latest estimate so the advisor can adjust price/scope. */
  const startRevision = () => {
    const latest = activeJob?.estimates?.[0] as any;
    if (latest && Array.isArray(latest.items) && latest.items.length > 0) {
      setEstimateLines(
        latest.items.map((it: any) => ({
          itemType: String(it.category || it.itemType || 'PART').replace(/S$/, '') === 'PART' ? 'PART' : String(it.category || 'LABOUR').toUpperCase().startsWith('CONSUMABLE') ? 'CONSUMABLE' : 'LABOUR',
          description: String(it.description || ''),
          quantity: Number(it.quantity || 1),
          unitRateRupees: Math.round(Number(it.unitPricePaise || 0) / 100),
          isMandatory: it.isMandatory !== false,
        })),
      );
    }
    setEstimateNotes('');
    setReviseMode(true);
  };

  const handleApproveEstimateInPerson = async (estimateId: string, negotiated = false) => {
    if (!activeJob) return;
    setActionBusy(true);
    try {
      await api.approveServiceEstimateByStaff(user, activeJob.id, estimateId, {
        decision: 'APPROVE',
        notes: negotiated
          ? 'Customer agreed to the estimate after negotiation with the service advisor (phone / in person).'
          : 'Estimate approved in-person by customer at workshop service counter.',
        channel: negotiated ? 'NEGOTIATION' : 'WORKSHOP_COUNTER',
      });
      onSuccess(`Estimate approved on behalf of customer. Work authorization granted for ${activeJob.requestNumber}.`);
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to approve estimate');
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
        result: qcPassed ? 'PASSED' : 'REWORK_REQUIRED',
        roadTestNotes: qcNotes,
        technicianNotes: qcNotes,
      });
      onSuccess(`QC ${qcPassed ? 'PASSED' : 'REWORK MARKED'} for ${activeJob.requestNumber}`);
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to record QC decision');
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
        autoVerify: paymentAutoVerify,
      });
      onSuccess(`Payment of ₹${paymentAmountRupees.toLocaleString('en-IN')} recorded successfully for ${activeJob.requestNumber}.`);
      setPaymentAmountRupees(0);
      setPaymentTxRef('');
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to record payment');
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
      onSuccess(`Vehicle for ${activeJob.requestNumber} released and handover recorded successfully.`);
      await refreshActiveJob(activeJob.id);
    } catch (err: any) {
      onError(err?.message || 'Failed to release vehicle return');
    } finally {
      setActionBusy(false);
    }
  };

  const handleWalkInSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!walkInHubId) {
      onError('Please select a service hub');
      return;
    }
    if (!walkInCustomerName.trim() || !walkInCustomerPhone.trim()) {
      onError('Customer name and phone number are required');
      return;
    }
    if (!walkInVehicleMake.trim() || !walkInVehicleModel.trim()) {
      onError('Vehicle make and model are required');
      return;
    }
    setWalkInSubmitting(true);
    try {
      const job = await api.createWalkInServiceJob(user, {
        hubId: walkInHubId,
        customerName: walkInCustomerName.trim(),
        customerPhone: walkInCustomerPhone.trim(),
        customerEmail: walkInCustomerEmail.trim() || undefined,
        vehicleMake: walkInVehicleMake.trim(),
        vehicleModel: walkInVehicleModel.trim(),
        vehicleYear: Number(walkInVehicleYear) || CURRENT_YEAR,
        fuelType: walkInFuelType,
        transmission: walkInTransmission,
        registrationNumber: walkInRegNumber.trim() || undefined,
        odometerKm: Number(walkInOdometer) || undefined,
        categoryKey: walkInCategoryKey || 'periodic-maintenance',
        customerSymptoms: walkInSymptoms.trim() || undefined,
        immediateIntake: walkInImmediateIntake,
        intakeOdometerKm: Number(walkInOdometer) || undefined,
        intakeFuelPercent: Number(walkInIntakeFuel) || 50,
        intakeNotes: walkInIntakeNotes.trim() || undefined,
        advancePaymentAmountRupees: walkInCollectPayment && walkInAdvancePayment > 0 ? Number(walkInAdvancePayment) : undefined,
        paymentMethod: walkInCollectPayment && walkInAdvancePayment > 0 ? walkInPaymentMethod : undefined,
        transactionReference: walkInCollectPayment && walkInAdvancePayment > 0 ? (walkInTxRef.trim() || `COUNTER-${Date.now()}`) : undefined,
      });

      onSuccess(`Walk-in service job ${job.requestNumber} created successfully.${walkInCollectPayment && walkInAdvancePayment > 0 ? ` Advance of ₹${walkInAdvancePayment.toLocaleString('en-IN')} recorded.` : ''}`);
      setWalkInModalOpen(false);

      // Reset
      setWalkInCustomerName('');
      setWalkInCustomerPhone('');
      setWalkInCustomerEmail('');
      setWalkInVehicleMake('');
      setWalkInVehicleModel('');
      setWalkInRegNumber('');
      setWalkInSymptoms('');
      setWalkInIntakeNotes('');
      setWalkInCollectPayment(false);
      setWalkInAdvancePayment(0);
      setWalkInTxRef('');
      void loadQueue();
    } catch (err: any) {
      onError(err?.message || 'Failed to create walk-in service booking');
    } finally {
      setWalkInSubmitting(false);
    }
  };

  // Calculations for active job financials
  const latestInvoice = activeJob?.finalInvoice || (activeJob?.invoices && activeJob.invoices.length > 0 ? activeJob.invoices[0] : null);

  const activeEstimateTotalRupees = latestInvoice
    ? Math.round(Number(latestInvoice.totalAmountPaise) / 100)
    : (activeJob?.estimates?.[0]
        ? Math.round(Number(activeJob.estimates[0].totalAmountPaise) / 100)
        : ((activeJob?.paymentPlanSnapshot as any)?.packagePricePaise
            ? Math.round(Number((activeJob?.paymentPlanSnapshot as any)?.packagePricePaise) / 100)
            : 0));

  const activeTotalPaidRupees = activeJob?.verifiedPaidPaise
    ? Math.round(Number(activeJob.verifiedPaidPaise) / 100)
    : (activeJob?.payments || []).reduce((acc, p) => {
        if (p.status === 'PAID_VERIFIED' || p.status === 'PENDING') {
          return acc + Math.round(Number(p.amountPaise) / 100);
        }
        return acc;
      }, 0);

  const activeBalanceDueRupees = activeJob?.outstandingBalancePaise !== undefined && activeJob?.outstandingBalancePaise !== null
    ? Math.round(Number(activeJob.outstandingBalancePaise) / 100)
    : Math.max(0, activeEstimateTotalRupees - activeTotalPaidRupees);

  // Auto-fill default payment amount when opening payment tab
  useEffect(() => {
    if (actionTab === 'payment' && activeBalanceDueRupees > 0 && paymentAmountRupees === 0) {
      setPaymentAmountRupees(activeBalanceDueRupees);
    }
  }, [actionTab, activeBalanceDueRupees]);

  const isJobCancelled = activeJob?.status === 'CANCELLED';
  const hasApprovedEstimate = !!activeJob?.estimates?.some(e => e.status === 'APPROVED');
  const isJobConcluded = (activeJob?.status === 'COMPLETED' || activeJob?.status === 'DELIVERED') &&
    hasApprovedEstimate &&
    activeBalanceDueRupees === 0;

  const statusBadgeClass = (status: ServiceJobStatus) => {
    switch (status) {
      case 'COMPLETED':
      case 'DELIVERED':
      case 'PAID':
      case 'QC_PASSED':
      case 'ESTIMATE_APPROVED':
        return 'badge-success';
      case 'CANCELLED':
      case 'ESTIMATE_REJECTED':
      case 'QC_REWORK_REQUIRED':
        return 'badge-danger';
      case 'PAYMENT_PENDING':
      case 'ESTIMATE_PENDING_APPROVAL':
      case 'QC_PENDING':
      case 'WORK_IN_PROGRESS':
      case 'PARTS_ORDERED':
      case 'DIAGNOSIS_IN_PROGRESS':
        return 'badge-warning';
      case 'CHECKED_IN':
      case 'ARRIVED_AT_HUB':
      case 'IN_TRANSIT_TO_HUB':
      case 'PICKUP_DISPATCHED':
      case 'APPOINTMENT_SCHEDULED':
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
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <IconService /> Car Service & Workshop Operations
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '4px 0 0' }}>
            Real-time workshop bookings, walk-in counter jobs, diagnostic estimates, QC sign-offs, billing and vehicle handover.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary button secondary"
            onClick={() => setPricingModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
          >
            ⚙️ Service Pricing & Packages
          </button>
          <button
            type="button"
            className="btn-primary btn-gold button primary"
            onClick={() => {
              if (branches.length > 0 && !walkInHubId) {
                setWalkInHubId(branches[0].id);
              }
              setWalkInModalOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
          >
            <span>+</span> Walk-in Service Booking
          </button>
          <button type="button" className="btn-secondary button secondary" onClick={() => void loadQueue()} disabled={loading}>
            <IconRefresh /> Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Bookings</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: 'var(--text)' }}>{total}</div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>In Workshop</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: '#38bdf8' }}>
            {jobs.filter(j => ['CHECKED_IN', 'DIAGNOSIS_IN_PROGRESS', 'WORK_IN_PROGRESS', 'QC_PENDING'].includes(j.status)).length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Pending Approval</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
            {jobs.filter(j => j.status === 'ESTIMATE_PENDING_APPROVAL').length}
          </div>
        </div>
        <div className="card-kpi" style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Payment Pending</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '4px', color: '#ec4899' }}>
            {jobs.filter(j => j.status === 'PAYMENT_PENDING').length}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flex: '1', minWidth: '260px', gap: '0.5rem' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              type="text"
              className="input search-input"
              placeholder="Search request #, customer, reg plate, phone…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: '2.25rem' }}
            />
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
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
      <div className="filter-chips-bar" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        {[
          { key: 'ALL', label: 'All Jobs' },
          { key: 'APPOINTMENT_SCHEDULED', label: 'Scheduled' },
          { key: 'CHECKED_IN', label: 'In Workshop' },
          { key: 'ESTIMATE_PENDING_APPROVAL', label: 'Estimate Pending' },
          { key: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
          { key: 'QC_PENDING', label: 'QC' },
          { key: 'PAYMENT_PENDING', label: 'Payment Pending' },
          { key: 'PAID', label: 'Paid' },
          { key: 'DELIVERED', label: 'Delivered / Closed' },
          { key: 'CANCELLED', label: 'Cancelled' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`filter-chip ${statusFilter === tab.key ? 'active' : ''}`}
            onClick={() => setStatusFilter(tab.key)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              fontSize: '0.8125rem',
              fontWeight: statusFilter === tab.key ? 700 : 500,
              border: statusFilter === tab.key ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: statusFilter === tab.key ? 'rgba(247, 181, 3, 0.15)' : 'var(--surface)',
              color: statusFilter === tab.key ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Jobs Queue Table */}
      <div className="card-table-wrapper" style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            <p>Loading workshop queue…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
            <p>No service jobs found matching your filters.</p>
          </div>
        ) : (
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem' }}>JOB # & DATE</th>
                <th style={{ padding: '0.75rem 1rem' }}>CUSTOMER</th>
                <th style={{ padding: '0.75rem 1rem' }}>VEHICLE</th>
                <th style={{ padding: '0.75rem 1rem' }}>CATEGORY & FULFILLMENT</th>
                <th style={{ padding: '0.75rem 1rem' }}>SCHEDULED SLOT</th>
                <th style={{ padding: '0.75rem 1rem' }}>ESTIMATE</th>
                <th style={{ padding: '0.75rem 1rem' }}>PAYMENT STATE</th>
                <th style={{ padding: '0.75rem 1rem' }}>STATUS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{job.requestNumber}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{formatDate(job.createdAt)}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{job.customer?.displayName || 'Walk-In Customer'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{job.customer?.phone || job.customer?.email || '—'}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{job.vehicle ? `${job.vehicle.make} ${job.vehicle.model} (${job.vehicle.year})` : '—'}</div>
                    <div style={{ fontSize: '0.75rem' }}>
                      <span className="code-pill">{job.vehicle?.registrationNumber || 'No Plate'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8125rem' }}>
                      {job.categoryKey?.replace(/-/g, ' ')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {job.fulfillmentType === 'DOORSTEP_PICKUP' ? '🚚 Pickup & Return' : '🏢 Hub Drop'}
                    </div>
                    {(() => {
                      const qaReq = typeof job.questionAnswers === 'object' && job.questionAnswers !== null
                        ? ((job.questionAnswers as any).requirements || (job.questionAnswers as any).symptoms)
                        : undefined;
                      const reqText = job.customerSymptoms || job.customerNotes || qaReq;
                      if (!reqText) return null;
                      return (
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--accent)',
                            marginTop: '3px',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: 'rgba(247, 181, 3, 0.1)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(247, 181, 3, 0.25)',
                          }}
                          title={String(reqText)}
                        >
                          Req: <strong>{String(reqText)}</strong>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div>{job.scheduledDate}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{job.scheduledTimeSlot}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {(() => {
                      const est = job.activeEstimate || job.estimates?.[0];
                      if (job.status === 'CANCELLED') return <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Withdrawn (cancelled)</span>;
                      if (!est) return <span style={{ color: 'var(--muted)' }}>—</span>;
                      const declined = est.status === 'DECLINED';
                      return (
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                            {formatRupees(est.totalAmountPaise)}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: est.status === 'APPROVED' ? '#10b981' : declined ? '#ef4444' : '#f59e0b' }}>
                            {est.status === 'APPROVED' ? '✓ APPROVED' : declined ? '✕ DECLINED — negotiate' : est.status.replace(/_/g, ' ')}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {(() => {
                      const verifiedPaid = Math.round(Number(job.verifiedPaidPaise || 0) / 100);
                      const balanceDue = Math.round(Number(job.outstandingBalancePaise || 0) / 100);
                      const pStatus = job.servicePaymentStatus || (balanceDue === 0 && verifiedPaid > 0 ? 'PAID_IN_FULL' : (verifiedPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'));

                      let badgeColor = '#ef4444';
                      let badgeBg = 'rgba(239, 68, 68, 0.15)';
                      let badgeText = 'UNPAID';
                      if (pStatus === 'PAID_IN_FULL' || (balanceDue === 0 && verifiedPaid > 0)) {
                        badgeColor = '#10b981';
                        badgeBg = 'rgba(16, 185, 129, 0.15)';
                        badgeText = 'PAID IN FULL';
                      } else if (pStatus === 'PARTIALLY_PAID' || verifiedPaid > 0) {
                        badgeColor = '#f59e0b';
                        badgeBg = 'rgba(245, 158, 11, 0.15)';
                        badgeText = 'PARTIAL';
                      }

                      return (
                        <div>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: badgeColor,
                              background: badgeBg,
                              border: `1px solid ${badgeColor}40`,
                              marginBottom: '4px',
                            }}
                          >
                            {badgeText}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                            Paid: <strong style={{ color: '#10b981' }}>₹{verifiedPaid.toLocaleString('en-IN')}</strong>
                          </div>
                          {balanceDue > 0 ? (
                            <div style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>
                              Due: ₹{balanceDue.toLocaleString('en-IN')}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: '#10b981' }}>
                              Due: ₹0
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${statusBadgeClass(job.status)}`} style={{ fontWeight: 700 }}>
                      {job.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-sm btn-primary button primary small"
                      onClick={() => void openJobModal(job)}
                    >
                      Manage Job
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MANAGE JOB MODAL */}
      {activeJob && (
        <div className="modal-overlay" style={{ zIndex: 1050 }}>
          <div className="modal-dialog" style={{ maxWidth: '980px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Job #{activeJob.requestNumber}</span>
                  <span className={`badge ${statusBadgeClass(activeJob.status)}`}>
                    {activeJob.status.replace(/_/g, ' ')}
                  </span>
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Created {formatDate(activeJob.createdAt)} · Hub: {activeJob.hub?.name || 'Local Workshop'}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setActiveJob(null)}
                style={{ width: '32px', height: '32px', borderRadius: '6px' }}
              >
                <IconCross />
              </button>
            </div>

            {/* Cancelled Alert Banner */}
            {isJobCancelled && (
              <div style={{
                margin: '0.85rem 1.25rem 0',
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderLeft: '4px solid #ef4444',
                borderRadius: '6px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 800, fontSize: '0.9rem' }}>
                    <span>✕</span> SERVICE JOB CANCELLED
                  </div>
                  <span className="badge badge-danger" style={{ fontWeight: 800 }}>LOCKED</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: '#fca5a5' }}>
                  This booking was cancelled.
                  {activeJob.cancellationReason && (
                    <span> Reason: <strong>{activeJob.cancellationReason}</strong></span>
                  )}
                </p>
              </div>
            )}

            {/* Concluded & Settled Banner */}
            {isJobConcluded && (
              <div style={{
                margin: '0.85rem 1.25rem 0',
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderLeft: '4px solid #10b981',
                borderRadius: '6px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 800, fontSize: '0.9rem' }}>
                    <span>✅</span> SERVICE COMPLETED, PAID & VEHICLE DELIVERED
                  </div>
                  <span className="badge badge-success" style={{ fontWeight: 800 }}>COMPLETED</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: '#6ee7b7' }}>
                  Vehicle has been successfully handed over to the customer and all payments are fully settled.
                </p>
              </div>
            )}

            {/* Payment Pending Alert Banner */}
            {activeJob.status === 'PAYMENT_PENDING' && (
              <div style={{
                margin: '0.85rem 1.25rem 0',
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(236, 72, 153, 0.12)',
                border: '1px solid rgba(236, 72, 153, 0.35)',
                borderLeft: '4px solid #ec4899',
                borderRadius: '6px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f472b6', fontWeight: 800, fontSize: '0.9rem' }}>
                    <span>💳</span> PAYMENT PENDING — ACTION REQUIRED
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-warning" style={{ fontWeight: 800 }}>
                      Due: ₹{activeBalanceDueRupees.toLocaleString('en-IN')}
                    </span>
                    <button
                      type="button"
                      className="btn-primary btn-sm button primary small"
                      onClick={() => setActionTab('payment')}
                      style={{ background: '#ec4899', borderColor: '#ec4899', color: '#fff', fontWeight: 700, padding: '0.3rem 0.75rem' }}
                    >
                      👉 Collect / Record Payment
                    </button>
                  </div>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.825rem', color: '#fbcfe8' }}>
                  Customer payment must be collected at the counter or verified before concluding final settlement. Use Tab 6 (Billing & Payment) to record.
                </p>
              </div>
            )}

            {/* Stepper Nav Tabs */}
            <div className="stepper-nav" style={{ display: 'flex', gap: '4px', overflowX: 'auto', borderBottom: '1px solid var(--border)', padding: '0.5rem 1.25rem 0', background: 'var(--surface-secondary)' }}>
              {[
                { id: 'details', label: 'Overview & Requirements' },
                { id: 'schedule', label: isJobCancelled ? '🔒 Schedule' : (isJobConcluded ? '✓ Schedule' : '1. Schedule') },
                { id: 'dispatch', label: isJobCancelled ? '🔒 Dispatch' : (isJobConcluded ? '✓ Dispatch' : '2. Dispatch') },
                { id: 'custody', label: isJobCancelled ? '🔒 Intake' : (isJobConcluded ? '✓ Intake' : '3. Intake & Custody') },
                { id: 'estimate', label: isJobCancelled ? '🔒 Estimate' : (isJobConcluded ? '✓ Estimate' : '4. Estimate & Approval') },
                { id: 'qc', label: isJobCancelled ? '🔒 QC' : (isJobConcluded ? '✓ QC' : '5. Quality Control') },
                { id: 'payment', label: '6. Billing & Ledger' },
                { id: 'return', label: isJobCancelled ? '🔒 Handover' : (isJobConcluded ? '✓ Handover' : '7. Release & Handover') },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`stepper-tab ${actionTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActionTab(tab.id as any)}
                  style={{
                    padding: '0.6rem 0.9rem',
                    border: 'none',
                    borderBottom: actionTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent',
                    color: actionTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                    fontWeight: actionTab === tab.id ? 700 : 500,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="modal-body custom-scrollbar" style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
              {loadingDetails && (
                <div style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', background: 'var(--surface-secondary)', borderRadius: '4px', marginBottom: '0.75rem' }}>
                  Refreshing full job details…
                </div>
              )}

              {/* TAB: OVERVIEW */}
              {actionTab === 'details' && (
                <div>
                  {/* 1. CUSTOMER REQUIREMENTS & REPORTED ISSUES (PROMINENT AT TOP) */}
                  <div style={{
                    background: 'rgba(247, 181, 3, 0.08)',
                    border: '1px solid rgba(247, 181, 3, 0.35)',
                    borderLeft: '4px solid var(--accent)',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1.25rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
                        Customer Requirements & Diagnostic Complaints
                      </div>
                      <span className="badge badge-info" style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                        {activeJob.categoryKey?.replace(/-/g, ' ')}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>
                      {activeJob.customerSymptoms || activeJob.customerNotes || 'No specific customer symptoms recorded.'}
                    </div>

                    {/* Safety alert if flag is active */}
                    {activeJob.emergencySafetyFlag && (
                      <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '4px', color: '#ef4444' }}>
                        <strong>⚠️ Critical Safety Warning Logged:</strong> {activeJob.safetyNotes || 'Emergency safety flag reported.'}
                      </div>
                    )}

                    {/* Diagnostic Questionnaire Answers */}
                    {activeJob.questionAnswers && typeof activeJob.questionAnswers === 'object' && Object.keys(activeJob.questionAnswers).length > 0 && (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(247, 181, 3, 0.25)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                          Diagnostic Questionnaire Responses:
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                          {Object.entries(activeJob.questionAnswers).map(([k, v]) => (
                            <div key={k} style={{ background: 'var(--surface)', padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.8125rem' }}>
                              <span style={{ color: 'var(--muted)', fontSize: '0.75rem', display: 'block' }}>
                                {k.replace(/_/g, ' ').toUpperCase()}:
                              </span>
                              <strong>{String(v)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Customer Photos / Uploaded Media */}
                    {Array.isArray(activeJob.mediaUrls) && activeJob.mediaUrls.length > 0 && (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed rgba(247, 181, 3, 0.25)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
                          Customer Attachments / Photos ({activeJob.mediaUrls.length}):
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {activeJob.mediaUrls.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'block', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}
                            >
                              <img src={url} alt={`Photo ${idx + 1}`} style={{ width: '60px', height: '60px', objectFit: 'cover' }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. SPECIFICATION CARDS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>CUSTOMER CONTACT</span>
                      <div><strong>{activeJob.customer?.displayName || 'Walk-In Customer'}</strong></div>
                      <div>Phone: {activeJob.customer?.phone || '—'}</div>
                      <div>Email: {activeJob.customer?.email || '—'}</div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>VEHICLE SPECIFICATIONS</span>
                      <div><strong>{activeJob.vehicle?.make} {activeJob.vehicle?.model} {activeJob.vehicle?.variant || ''}</strong></div>
                      <div>Year: {activeJob.vehicle?.year || '—'} · Fuel: {activeJob.vehicle?.fuelType || 'Petrol'}</div>
                      <div>Reg Plate: <span className="code-pill">{activeJob.vehicle?.registrationNumber || 'No Plate'}</span></div>
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>LOGISTICS & HUB</span>
                      <div><strong>{activeJob.hub?.name || 'Local Hub'} ({activeJob.hub?.city})</strong></div>
                      <div>Fulfillment: {activeJob.fulfillmentType === 'DOORSTEP_PICKUP' ? 'Doorstep Pickup' : 'Self Drop at Hub'}</div>
                      {activeJob.pickupAddress && <div style={{ fontSize: '0.8rem' }}>Pickup: {String(activeJob.pickupAddress)}</div>}
                    </div>
                    <div style={{ background: 'var(--surface-secondary)', padding: '0.75rem', borderRadius: '6px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>CURRENT STATUS</span>
                      <div>
                        <span className={`badge ${statusBadgeClass(activeJob.status)}`} style={{ fontWeight: 800 }}>
                          {activeJob.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '4px' }}>
                        Created: {formatDate(activeJob.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* 3. CUSTODY INTAKE DETAILS */}
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

                  {/* 4. FINANCIAL & PAYMENT SUMMARY */}
                  <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--accent)' }}>Billing & Payment Summary</strong>
                      {activeJob.estimates?.[0] && (
                        <span className={`badge ${activeJob.estimates[0].status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                          Estimate: {activeJob.estimates[0].status}
                        </span>
                      )}
                    </div>
                    {activeJob.paymentPlanSnapshot && (
                      <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(247, 181, 3, 0.1)', border: '1px solid rgba(247, 181, 3, 0.25)', borderRadius: '6px', fontSize: '0.8rem' }}>
                        Selected Booking Plan: <strong style={{ color: 'var(--accent)' }}>{(activeJob.paymentPlanSnapshot as any).title || (activeJob.paymentPlanSnapshot as any).planId}</strong>
                        {(activeJob.paymentPlanSnapshot as any).percentage ? ` (${(activeJob.paymentPlanSnapshot as any).percentage}% Advance)` : ''}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Approved Estimate</span>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
                          ₹{activeEstimateTotalRupees.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Total Paid</span>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>
                          ₹{activeTotalPaidRupees.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Balance Due</span>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: activeBalanceDueRupees > 0 ? '#ef4444' : 'var(--muted)' }}>
                          ₹{activeBalanceDueRupees.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Transactions</span>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                          {(activeJob.payments || []).length}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5. TRANSACTION RECORDS & PAYMENT HISTORY */}
                  <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-secondary)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                      <strong style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--accent)' }}>
                        Transaction Records & Payment History ({(activeJob.payments || []).length})
                      </strong>
                      <button
                        type="button"
                        className="btn-primary btn-sm button primary small"
                        onClick={() => setActionTab('payment')}
                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem', fontWeight: 700 }}
                      >
                        + Record / Settle Payment
                      </button>
                    </div>

                    {!(activeJob.payments && activeJob.payments.length > 0) ? (
                      <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', color: 'var(--muted)', fontSize: '0.8125rem' }}>
                        No payment transactions recorded for this service request yet.
                      </div>
                    ) : (
                      <div style={{ background: 'var(--surface)', borderRadius: '6px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                              <th style={{ padding: '0.5rem 0.75rem' }}>DATE</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>TYPE</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>AMOUNT</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>METHOD</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>TXN REF / ID</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeJob.payments.map((p, idx) => (
                              <tr key={p.id || idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{formatDate(p.createdAt)}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}><span className="code-pill">{p.type}</span></td>
                                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 800, color: 'var(--text)' }}>
                                  ₹{Math.round(Number(p.amountPaise) / 100).toLocaleString('en-IN')}
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>{p.paymentGateway || 'COUNTER'}</td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    {p.gatewayPaymentId || p.gatewayOrderId || '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.5rem 0.75rem' }}>
                                  <span className={`badge ${p.status === 'PAID_VERIFIED' ? 'badge-success' : p.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}`}>
                                    {p.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Cancel Job Action */}
                  {!isJobCancelled && !isJobConcluded && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-danger btn-sm button danger small"
                        onClick={() => setCancelPromptOpen(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.45rem 0.9rem' }}
                      >
                        <span>✕</span> Cancel Service Job
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 1: SCHEDULE */}
              {actionTab === 'schedule' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>Appointment Locked — Job Cancelled</h4>
                  </div>
                ) : (
                  <form onSubmit={handleScheduleSubmit}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Re-assign service advisor or reschedule the workshop appointment slot.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Scheduled Date *</label>
                        <input
                          type="date"
                          className="input"
                          required
                          value={scheduleDate || activeJob.scheduledDate}
                          onChange={e => setScheduleDate(e.target.value)}
                          style={{ width: '100%', marginTop: '4px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Time Slot *</label>
                        <select
                          className="select"
                          value={scheduleSlot || activeJob.scheduledTimeSlot}
                          onChange={e => setScheduleSlot(e.target.value)}
                          style={{ width: '100%', marginTop: '4px' }}
                        >
                          <option value="10:00 - 12:00">10:00 - 12:00</option>
                          <option value="12:00 - 14:00">12:00 - 14:00</option>
                          <option value="15:00 - 17:00">15:00 - 17:00</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Close</button>
                      <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                        {actionBusy ? 'Saving…' : 'Update Appointment'}
                      </button>
                    </div>
                  </form>
                )
              )}

              {/* TAB 2: DISPATCH */}
              {actionTab === 'dispatch' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>Dispatch Locked — Job Cancelled</h4>
                  </div>
                ) : isJobConcluded ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                    <h4 style={{ margin: 0, color: '#10b981' }}>Dispatch & Logistics Completed</h4>
                    <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Fulfillment type: {activeJob.fulfillmentType === 'DOORSTEP_PICKUP' ? 'Doorstep Pickup & Return' : 'Self Drop at Workshop Hub'}.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleDispatchSubmit}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Assign a workshop pickup or return delivery driver to retrieve or drop the vehicle.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Dispatch Movement Type *</label>
                        <select
                          className="select"
                          value={dispatchType}
                          onChange={e => setDispatchType(e.target.value as any)}
                          style={{ width: '100%', marginTop: '4px' }}
                        >
                          <option value="PICKUP">Doorstep Pickup (Intake to Hub)</option>
                          <option value="RETURN">Return Delivery (Hub to Customer)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Driver ID / Staff Name</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Suresh Kumar"
                          value={dispatchDriverId}
                          onChange={e => setDispatchDriverId(e.target.value)}
                          style={{ width: '100%', marginTop: '4px' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Close</button>
                      <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                        {actionBusy ? 'Dispatching…' : 'Confirm Driver Dispatch'}
                      </button>
                    </div>
                  </form>
                )
              )}

              {/* TAB 3: INTAKE & CUSTODY */}
              {actionTab === 'custody' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>Intake Locked — Job Cancelled</h4>
                  </div>
                ) : activeJob.custodyRecord ? (
                  <div style={{ padding: '1.25rem', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, marginBottom: '0.75rem' }}>
                      <span>✓</span> Vehicle Custody Intake Recorded
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                      <div><strong>Odometer:</strong> {activeJob.custodyRecord.odometerKm} km</div>
                      <div><strong>Fuel Level:</strong> {activeJob.custodyRecord.fuelPercent}%</div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <strong>Condition & Damage Notes:</strong>
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
                          {activeJob.custodyRecord.exteriorNotes || 'Visual inspection complete. No major dents observed.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCustodySubmit}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Record vehicle physical custody check-in, current odometer reading, fuel level, and pre-existing scratches.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Odometer Reading (km) *</label>
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
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Fuel Tank Level (%) *</label>
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
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Pre-existing Damage / Inspection Notes</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={intakeNotes}
                        onChange={e => setIntakeNotes(e.target.value)}
                        placeholder="e.g. Minor scratch on rear bumper, spare tire present, toolkit checked."
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Close</button>
                      <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                        {actionBusy ? 'Saving…' : 'Confirm Custody Check-In'}
                      </button>
                    </div>
                  </form>
                )
              )}

              {/* TAB 4: ESTIMATE & APPROVAL */}
              {actionTab === 'estimate' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>Estimate Locked — Job Cancelled</h4>
                    {activeJob.custodyRecord && (
                      <div role="alert" style={{ margin: '0.75rem auto 0', maxWidth: 520, textAlign: 'left', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}>
                        <strong style={{ color: '#f59e0b' }}>Vehicle return required.</strong> This car was checked in at the workshop before the job was cancelled. Arrange its return and confirm handover with the customer.
                      </div>
                    )}
                    <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Any open estimate was withdrawn automatically. The customer can no longer review or approve it.
                      {(activeJob as any).cancellationReason ? ` Reason: ${(activeJob as any).cancellationReason}.` : ''}
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* CUSTOMER REQUIREMENTS & REPORTED COMPLAINTS (SHOWN BEFORE/DURING ESTIMATE) */}
                    <div style={{
                      background: 'rgba(247, 181, 3, 0.08)',
                      border: '1px solid rgba(247, 181, 3, 0.35)',
                      borderLeft: '4px solid var(--accent)',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      marginBottom: '1.25rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
                          Customer Requirements & Reported Complaints
                        </span>
                        <span className="badge badge-info" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {activeJob.categoryKey?.replace(/-/g, ' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                        {activeJob.customerSymptoms || activeJob.customerNotes || (activeJob.questionAnswers as any)?.requirements || (activeJob.questionAnswers as any)?.symptoms || 'Walk-in service customer intake.'}
                      </div>
                      {activeJob.emergencySafetyFlag && (
                        <div style={{ marginTop: '0.4rem', color: '#ef4444', fontSize: '0.8rem', fontWeight: 700 }}>
                          ⚠️ Critical Safety Warning: {activeJob.safetyNotes || 'Emergency safety flag reported.'}
                        </div>
                      )}
                    </div>

                    {/* NEGOTIATION: customer declined the latest estimate */}
                    {activeJob.estimates?.[0]?.status === 'DECLINED' && !reviseMode && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.45)', borderLeft: '4px solid #ef4444', padding: '0.9rem 1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                        <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Customer declined estimate v{(activeJob.estimates[0] as any).version ?? ''}
                        </div>
                        <div style={{ fontSize: '0.9rem', marginTop: '0.35rem' }}>
                          {(activeJob.estimates[0] as any).responseNotes || 'No reason was given. Call the customer to understand their concern.'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                          Next step: call the customer, then send a revised estimate, record their agreement, or cancel the service.
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                          <button type="button" className="btn-primary btn-gold button primary" disabled={actionBusy} onClick={startRevision}>
                            ✎ Revise & Resend Estimate
                          </button>
                          <button type="button" className="btn-secondary button secondary" disabled={actionBusy} onClick={() => handleApproveEstimateInPerson(activeJob.estimates![0].id, true)}>
                            ✓ Customer Agreed (Record Approval)
                          </button>
                          <button type="button" className="button secondary" style={{ color: '#ef4444', borderColor: '#ef4444' }} disabled={actionBusy} onClick={() => setCancelPromptOpen(true)}>
                            ✕ Cancel Service
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Estimate version history */}
                    {(activeJob.estimates?.length || 0) > 1 && !reviseMode && (
                      <div style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', fontSize: '0.7rem', marginBottom: '0.25rem' }}>Estimate history</div>
                        {activeJob.estimates!.map((e: any) => (
                          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                            <span>v{e.version ?? '?'} · {formatRupees(e.totalAmountPaise)}</span>
                            <span style={{ color: e.status === 'APPROVED' ? '#10b981' : e.status === 'DECLINED' ? '#ef4444' : 'var(--muted)' }}>
                              {String(e.status).replace(/_/g, ' ')}{e.responseNotes ? ` — ${e.responseNotes}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeJob.estimates?.[0] && !reviseMode ? (
                  <div style={{ padding: '1.25rem', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '1rem' }}>
                          <span>Estimate #{activeJob.estimates[0].id.slice(0, 8)}</span>
                          <span className={`badge ${activeJob.estimates[0].status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                            {activeJob.estimates[0].status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                          Total: <strong style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>{formatRupees(activeJob.estimates[0].totalAmountPaise)}</strong>
                        </div>
                      </div>

                      {/* IN-PERSON / STAFF APPROVAL BUTTON */}
                      {activeJob.estimates[0].status === 'SENT_TO_CUSTOMER' && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-primary btn-gold button primary"
                            disabled={actionBusy}
                            onClick={() => handleApproveEstimateInPerson(activeJob.estimates![0].id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                          >
                            <span>✓</span> Approve Estimate (In-Person / Phone)
                          </button>
                          <button type="button" className="btn-secondary button secondary" disabled={actionBusy} onClick={startRevision}>
                            ✎ Revise Estimate
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Estimate Line Items */}
                    {Array.isArray((activeJob.estimates[0] as any).items) && (activeJob.estimates[0] as any).items.length > 0 && (
                      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Itemized Breakdown:</span>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                              <th style={{ padding: '4px 8px' }}>TYPE</th>
                              <th style={{ padding: '4px 8px' }}>DESCRIPTION</th>
                              <th style={{ padding: '4px 8px', textAlign: 'center' }}>QTY</th>
                              <th style={{ padding: '4px 8px', textAlign: 'right' }}>RATE</th>
                              <th style={{ padding: '4px 8px', textAlign: 'center' }}>CUSTOMER CHOICE</th>
                              <th style={{ padding: '4px 8px', textAlign: 'right' }}>TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {((activeJob.estimates[0] as any).items || []).map((item: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <td style={{ padding: '6px 8px' }}><span className="code-pill">{item.category || item.itemType}</span></td>
                                <td style={{ padding: '6px 8px' }}>{item.description}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.quantity}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatRupees(item.unitPricePaise || item.unitRatePaise)}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: item.isApprovedByCustomer === false && activeJob.estimates![0].status === 'APPROVED' ? '#ef4444' : item.isMandatory === false ? '#f59e0b' : 'var(--muted)' }}>
                                  {item.isApprovedByCustomer === false && activeJob.estimates![0].status === 'APPROVED'
                                    ? 'DEFERRED BY CUSTOMER'
                                    : item.isMandatory === false ? 'RECOMMENDED' : 'REQUIRED'}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{formatRupees(item.totalPricePaise || item.lineTotalPaise)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleEstimateSubmit}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      {reviseMode
                        ? 'Adjust the lines below and resend. The customer is notified and the previous version is kept in history.'
                        : 'Prepare itemized diagnostic estimate with required replacement spares and labor charges for customer approval.'}
                    </p>

                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)' }}>Itemized Lines</label>
                        <button
                          type="button"
                          className="btn-sm btn-secondary button secondary small"
                          onClick={() => setEstimateLines(prev => [...prev, { itemType: 'PART', description: '', quantity: 1, unitRateRupees: 0, isMandatory: false }])}
                        >
                          + Add Line
                        </button>
                      </div>

                      {estimateLines.map((line, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 2fr 80px 120px 140px 36px', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                          <select
                            className="select"
                            value={line.itemType}
                            onChange={e => {
                              const val = e.target.value;
                              setEstimateLines(prev => prev.map((l, i) => i === idx ? { ...l, itemType: val } : l));
                            }}
                          >
                            <option value="LABOUR">LABOUR</option>
                            <option value="PART">PART</option>
                            <option value="CONSUMABLE">CONSUMABLE</option>
                          </select>
                          <input
                            type="text"
                            className="input"
                            placeholder="Description"
                            required
                            value={line.description}
                            onChange={e => {
                              const val = e.target.value;
                              setEstimateLines(prev => prev.map((l, i) => i === idx ? { ...l, description: val } : l));
                            }}
                          />
                          <input
                            type="number"
                            className="input"
                            min={1}
                            required
                            value={line.quantity}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setEstimateLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: val } : l));
                            }}
                          />
                          <input
                            type="number"
                            className="input"
                            min={0}
                            required
                            placeholder="₹ Rate"
                            value={line.unitRateRupees}
                            onChange={e => {
                              const val = Number(e.target.value);
                              setEstimateLines(prev => prev.map((l, i) => i === idx ? { ...l, unitRateRupees: val } : l));
                            }}
                          />
                          <select
                            className="select"
                            title="Required work cannot be deferred by the customer. Recommended work can."
                            value={line.isMandatory ? 'REQUIRED' : 'RECOMMENDED'}
                            onChange={e => {
                              const required = e.target.value === 'REQUIRED';
                              setEstimateLines(prev => prev.map((l, i) => i === idx ? { ...l, isMandatory: required } : l));
                            }}
                          >
                            <option value="REQUIRED">Required</option>
                            <option value="RECOMMENDED">Recommended</option>
                          </select>
                          {estimateLines.length > 1 && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => setEstimateLines(prev => prev.filter((_, i) => i !== idx))}
                              style={{ color: '#ef4444' }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      {reviseMode ? (
                        <button type="button" className="btn-secondary button secondary" onClick={() => setReviseMode(false)}>Back</button>
                      ) : (
                        <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Close</button>
                      )}
                      <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                        {actionBusy ? 'Sending…' : reviseMode ? 'Send Revised Estimate' : 'Issue Estimate to Customer'}
                      </button>
                    </div>
                  </form>
                )}
                    </div>
                  )
                )}

              {/* TAB 5: QUALITY CONTROL */}
              {actionTab === 'qc' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>QC Locked — Job Cancelled</h4>
                  </div>
                ) : isJobConcluded ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                    <h4 style={{ margin: 0, color: '#10b981' }}>Quality Control Certified & Passed</h4>
                    <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      QC road test and multi-point inspection verified before vehicle departure.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleQcSubmit}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Conduct multi-point quality control road test and sign off before vehicle release.
                    </p>
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <input
                          type="radio"
                          name="qcDecision"
                          checked={qcPassed}
                          onChange={() => setQcPassed(true)}
                        />
                        <span style={{ color: '#10b981' }}>✓ Quality Control PASSED</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <input
                          type="radio"
                          name="qcDecision"
                          checked={!qcPassed}
                          onChange={() => setQcPassed(false)}
                        />
                        <span style={{ color: '#ef4444' }}>✕ Rework Required</span>
                      </label>
                    </div>

                    <div style={{ marginTop: '1rem' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>QC Inspector Notes & Road Test Findings</label>
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
                      <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Close</button>
                      <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                        {actionBusy ? 'Saving…' : 'Sign Off Quality Control'}
                      </button>
                    </div>
                  </form>
                )
              )}

              {/* TAB 6: BILLING & PAYMENT (ALWAYS ACCESSIBLE WITH HISTORY) */}
              {actionTab === 'payment' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>Payment Processing Locked — Job Cancelled</h4>
                  </div>
                ) : (
                  <div>
                    {/* FINANCIAL SUMMARY CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Approved Estimate</span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                          ₹{activeEstimateTotalRupees.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Collected</span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                          ₹{activeTotalPaidRupees.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Balance Due</span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: activeBalanceDueRupees > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                          ₹{activeBalanceDueRupees.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    {/* TAX INVOICE CARD */}
                    <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--surface-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🧾 Official Tax Invoice (GST 18%)</span>
                            {activeJob.invoices && activeJob.invoices.length > 0 && (
                              <span className="code-pill">{activeJob.invoices[0].invoiceNumber}</span>
                            )}
                          </h4>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {activeJob.invoices && activeJob.invoices.length > 0
                              ? `Issued ${formatDate(activeJob.invoices[0].issuedAt)} · Status: ${activeJob.invoices[0].status}`
                              : 'Final tax invoice has not been generated for this completed service.'}
                          </span>
                        </div>
                        {(!activeJob.invoices || activeJob.invoices.length === 0) && (
                          <button
                            type="button"
                            className="btn-primary btn-gold button primary small"
                            onClick={handleGenerateInvoice}
                            disabled={generatingInvoice || isJobCancelled}
                            style={{ fontWeight: 700 }}
                          >
                            {generatingInvoice ? 'Generating Invoice…' : '+ Generate Final Tax Invoice'}
                          </button>
                        )}
                      </div>

                      {activeJob.invoices && activeJob.invoices.length > 0 ? (
                        <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Gross Subtotal:</span>
                              <div style={{ fontWeight: 700 }}>₹{Math.round(Number(activeJob.invoices[0].subtotalPaise) / 100).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>CGST (9%) + SGST (9%):</span>
                              <div style={{ fontWeight: 700 }}>₹{(Math.round(Number(activeJob.invoices[0].cgstPaise) / 100) + Math.round(Number(activeJob.invoices[0].sgstPaise) / 100)).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Prepayment Credits:</span>
                              <div style={{ fontWeight: 700, color: '#10b981' }}>-₹{(Math.round(Number(activeJob.invoices[0].priorPaymentsCreditedPaise) / 100) + Math.round(Number(activeJob.invoices[0].diagnosticFeeCreditPaise) / 100)).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Net Invoice Total:</span>
                              <div style={{ fontWeight: 800, color: 'var(--accent)' }}>₹{Math.round(Number(activeJob.invoices[0].totalAmountPaise) / 100).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Outstanding Balance:</span>
                              <div style={{ fontWeight: 800, color: Number(activeJob.invoices[0].outstandingPaise) > 0 ? '#ef4444' : '#10b981' }}>
                                ₹{Math.round(Number(activeJob.invoices[0].outstandingPaise) / 100).toLocaleString('en-IN')}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--muted)' }}>
                          Click &quot;+ Generate Final Tax Invoice&quot; to calculate 18% GST (9% CGST + 9% SGST), credit prior advances/diagnostic fees, and produce an official tax invoice.
                        </p>
                      )}
                    </div>

                    {/* TRANSACTION RECORDS HISTORY TABLE */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.05em' }}>
                          Transaction Records & Payment History
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {(activeJob.payments || []).length} Recorded Transaction(s)
                        </span>
                      </div>

                      {!(activeJob.payments && activeJob.payments.length > 0) ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '6px', color: 'var(--muted)', fontSize: '0.875rem' }}>
                          No payment transactions recorded for this service request yet.
                        </div>
                      ) : (
                        <div style={{ background: 'var(--surface-secondary)', borderRadius: '6px', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                              <tr style={{ background: 'rgba(255, 255, 255, 0.04)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                <th style={{ padding: '0.6rem 0.75rem' }}>DATE & TIME</th>
                                <th style={{ padding: '0.6rem 0.75rem' }}>TYPE</th>
                                <th style={{ padding: '0.6rem 0.75rem' }}>AMOUNT</th>
                                <th style={{ padding: '0.6rem 0.75rem' }}>METHOD / GATEWAY</th>
                                <th style={{ padding: '0.6rem 0.75rem' }}>REF / TRANSACTION ID</th>
                                <th style={{ padding: '0.6rem 0.75rem' }}>STATUS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeJob.payments.map((p, idx) => (
                                <tr key={p.id || idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>{formatDate(p.createdAt)}</td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}><span className="code-pill">{p.type}</span></td>
                                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 800, color: 'var(--text)' }}>
                                    ₹{Math.round(Number(p.amountPaise) / 100).toLocaleString('en-IN')}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>{p.paymentGateway || 'COUNTER'}</td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                      {p.gatewayPaymentId || p.gatewayOrderId || '—'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.6rem 0.75rem' }}>
                                    <span className={`badge ${p.status === 'PAID_VERIFIED' ? 'badge-success' : p.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}`}>
                                      {p.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* RECORD NEW PAYMENT FORM */}
                    {!isJobConcluded ? (
                      <form onSubmit={handlePaymentSubmit} style={{ padding: '1.25rem', background: 'var(--surface-secondary)', borderRadius: '8px', border: '1px solid rgba(247, 181, 3, 0.25)' }}>
                        <h4 style={{ margin: '0 0 0.5rem', color: 'var(--accent)' }}>Record Payment Transaction</h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', margin: '0 0 1rem' }}>
                          Record counter customer payment received via UPI QR, card terminal POS, cash, or bank transfer.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                              <option value="CASH">Cash Counter</option>
                              <option value="NEFT">NEFT / RTGS Transfer</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                          <div>
                            <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>UTR / Bank Reference / POS Slip #</label>
                            <input
                              type="text"
                              className="input"
                              placeholder="e.g. UPI-UTR-20261102 or POS Slip #1234"
                              value={paymentTxRef}
                              onChange={e => setPaymentTxRef(e.target.value)}
                              style={{ width: '100%', marginTop: '4px' }}
                            />
                          </div>
                          <div style={{ paddingTop: '1.25rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                              <input
                                type="checkbox"
                                checked={paymentAutoVerify}
                                onChange={e => setPaymentAutoVerify(e.target.checked)}
                              />
                              <span>Verify Immediately at Counter</span>
                            </label>
                          </div>
                        </div>

                        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                          <button type="submit" className="btn-primary btn-gold button primary" disabled={actionBusy}>
                            {actionBusy ? 'Recording…' : 'Record Service Payment'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px', color: '#10b981', fontWeight: 600, textAlign: 'center' }}>
                        ✓ Total invoice amount is fully settled. No balance remaining.
                      </div>
                    )}
                  </div>
                )
              )}

              {/* TAB 7: RELEASE & HANDOVER */}
              {actionTab === 'return' && (
                isJobCancelled ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                    <h4 style={{ margin: 0, color: '#ef4444' }}>Vehicle Release Locked — Job Cancelled</h4>
                  </div>
                ) : isJobConcluded ? (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '8px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                    <h4 style={{ margin: 0, color: '#10b981' }}>Vehicle Handover Concluded & Closed</h4>
                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Vehicle has been physically released to customer and all service balances are settled in full.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleReturnSubmit}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                      Complete final vehicle departure check-out, record release odometer, and document customer handover.
                    </p>

                    {(() => {
                      const gateQc = readinessData?.gateChecks ? readinessData.gateChecks.qcPassed : (activeJob.qcRecord?.isPassed || (activeJob as any).qcRecords?.[0]?.result === 'PASS');
                      const gateEstimate = readinessData?.gateChecks ? readinessData.gateChecks.estimateApproved : !!activeJob.estimates?.some(e => e.status === 'APPROVED');
                      const gateInvoice = readinessData?.gateChecks ? readinessData.gateChecks.invoiceIssued : (Boolean(activeJob.invoices && activeJob.invoices.length > 0));
                      const gateSettled = readinessData?.gateChecks ? readinessData.gateChecks.paymentSettled : (activeBalanceDueRupees === 0 && activeTotalPaidRupees > 0);
                      const isBlocked = readinessData ? !readinessData.canRelease : (!gateQc || !gateEstimate || !gateInvoice || !gateSettled);

                      return (
                        <>
                          {/* RELEASE READINESS GATE CHECKLIST */}
                          <div style={{ padding: '1rem', background: 'var(--surface-secondary)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: '0.75rem' }}>
                              Vehicle Release Readiness Checklist (Authoritative Gate)
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', background: 'var(--surface)', borderRadius: '6px' }}>
                                <span style={{ fontSize: '1.1rem' }}>{gateQc ? '✅' : '❌'}</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>1. QC Inspection</div>
                                  <div style={{ fontSize: '0.7rem', color: gateQc ? '#10b981' : '#ef4444' }}>{gateQc ? 'Passed' : 'Pending QC Sign-off'}</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', background: 'var(--surface)', borderRadius: '6px' }}>
                                <span style={{ fontSize: '1.1rem' }}>{gateEstimate ? '✅' : '❌'}</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>2. Customer Estimate</div>
                                  <div style={{ fontSize: '0.7rem', color: gateEstimate ? '#10b981' : '#ef4444' }}>{gateEstimate ? 'Approved' : 'Pending Approval'}</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', background: 'var(--surface)', borderRadius: '6px' }}>
                                <span style={{ fontSize: '1.1rem' }}>{gateInvoice ? '✅' : '❌'}</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>3. Tax Invoice</div>
                                  <div style={{ fontSize: '0.7rem', color: gateInvoice ? '#10b981' : '#ef4444' }}>{gateInvoice ? 'Issued (GST 18%)' : 'Invoice Not Issued'}</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', background: 'var(--surface)', borderRadius: '6px' }}>
                                <span style={{ fontSize: '1.1rem' }}>{gateSettled ? '✅' : '❌'}</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>4. Payment Settled</div>
                                  <div style={{ fontSize: '0.7rem', color: gateSettled ? '#10b981' : '#ef4444' }}>
                                    {gateSettled ? 'Fully Settled (₹0 Due)' : `Pending ₹${activeBalanceDueRupees.toLocaleString('en-IN')}`}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {isBlocked && (
                            <div style={{ padding: '0.85rem 1rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '8px', marginBottom: '1rem', color: '#ef4444' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ⚠️ VEHICLE HANDOVER STRICTLY BLOCKED — ACTION REQUIRED
                              </div>
                              <div style={{ fontSize: '0.825rem', marginTop: '4px', color: 'var(--text)' }}>
                                {readinessData?.reasons && readinessData.reasons.length > 0
                                  ? readinessData.reasons.join(' · ')
                                  : (!gateQc
                                      ? 'Quality control inspection must be passed in Tab 5.'
                                      : (!gateEstimate
                                          ? 'Customer must approve the diagnostic estimate.'
                                          : (!gateInvoice
                                              ? 'Final tax invoice must be issued in Tab 6.'
                                              : `Outstanding balance of ₹${activeBalanceDueRupees.toLocaleString('en-IN')} must be collected.`)))}
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                            <div>
                              <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Departure Odometer (km) *</label>
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
                              <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Handover Recipient</label>
                              <input
                                type="text"
                                className="input"
                                readOnly
                                value={activeJob.customer?.displayName || 'Customer Pickup / Delivery'}
                                style={{ width: '100%', marginTop: '4px', opacity: 0.8 }}
                              />
                            </div>
                          </div>

                          <div style={{ marginTop: '1rem' }}>
                            <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Handover & Departure Notes</label>
                            <textarea
                              className="input"
                              rows={3}
                              value={returnNotes}
                              onChange={e => setReturnNotes(e.target.value)}
                              style={{ width: '100%', marginTop: '4px' }}
                            />
                          </div>

                          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button type="button" className="btn-secondary button secondary" onClick={() => setActiveJob(null)}>Close</button>
                            <button
                              type="submit"
                              className="btn-primary btn-gold button primary"
                              disabled={actionBusy || isBlocked}
                              title={isBlocked ? 'Handover blocked: estimate approval and payment required.' : undefined}
                            >
                              {isBlocked
                                ? (readinessData?.reasons?.[0] || 'Handover Blocked: Requirements Pending')
                                : (actionBusy ? 'Releasing…' : 'Release Vehicle & Conclude Handover')}
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </form>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* WALK-IN SERVICE BOOKING MODAL */}
      {walkInModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-dialog" style={{ maxWidth: '780px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>+</span> Offline Walk-In Service Booking
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Register a customer and vehicle arriving in-person at the workshop counter
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setWalkInModalOpen(false)}
                style={{ width: '32px', height: '32px', borderRadius: '6px' }}
              >
                <IconCross />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-body custom-scrollbar" style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* 1. WORKSHOP HUB */}
                <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', display: 'block', marginBottom: '0.5rem' }}>
                    1. Workshop Location & Service Category *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Select Service Hub *</label>
                      <select
                        className="select"
                        required
                        value={walkInHubId}
                        onChange={e => setWalkInHubId(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      >
                        <option value="">-- Choose Workshop Hub --</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Service Category *</label>
                      <select
                        className="select"
                        required
                        value={walkInCategoryKey}
                        onChange={e => setWalkInCategoryKey(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      >
                        {categories.length > 0 ? (
                          categories.map(cat => (
                            <option key={cat.categoryKey} value={cat.categoryKey}>
                              {cat.title}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="periodic-maintenance">Periodic Maintenance</option>
                            <option value="general-repairs">General Repairs</option>
                            <option value="ac-service">AC Service & Cooling</option>
                            <option value="brake-system">Brake System Overhaul</option>
                            <option value="engine-diagnostics">Engine Diagnostics & Tuning</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. CUSTOMER IDENTITY */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.5rem' }}>
                    2. Customer Contact Details *
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Customer Name *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        placeholder="e.g. Ramesh Kumar"
                        value={walkInCustomerName}
                        onChange={e => setWalkInCustomerName(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Mobile Number (+91) *</label>
                      <input
                        type="tel"
                        className="input"
                        required
                        placeholder="+91 9876543210"
                        value={walkInCustomerPhone}
                        onChange={e => setWalkInCustomerPhone(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Email Address (Optional)</label>
                      <input
                        type="email"
                        className="input"
                        placeholder="customer@example.com"
                        value={walkInCustomerEmail}
                        onChange={e => setWalkInCustomerEmail(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. VEHICLE SPECIFICATIONS */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.5rem' }}>
                    3. Vehicle Specifications *
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Make *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        placeholder="e.g. Hyundai, Honda"
                        value={walkInVehicleMake}
                        onChange={e => setWalkInVehicleMake(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Model *</label>
                      <input
                        type="text"
                        className="input"
                        required
                        placeholder="e.g. Creta, City"
                        value={walkInVehicleModel}
                        onChange={e => setWalkInVehicleModel(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Model Year *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        min={1990}
                        max={CURRENT_YEAR + 1}
                        value={walkInVehicleYear}
                        onChange={e => setWalkInVehicleYear(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Fuel Type</label>
                      <select
                        className="select"
                        value={walkInFuelType}
                        onChange={e => setWalkInFuelType(e.target.value)}
                        style={{ width: '100%', marginTop: '3px' }}
                      >
                        <option value="PETROL">Petrol</option>
                        <option value="DIESEL">Diesel</option>
                        <option value="CNG">CNG</option>
                        <option value="ELECTRIC">Electric</option>
                        <option value="HYBRID">Hybrid</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Registration Number</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. KA01AB1234"
                        value={walkInRegNumber}
                        onChange={e => setWalkInRegNumber(e.target.value.toUpperCase())}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Current Odometer (km)</label>
                      <input
                        type="number"
                        className="input"
                        min={0}
                        value={walkInOdometer}
                        onChange={e => setWalkInOdometer(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '3px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. CUSTOMER REQUIREMENTS & SYMPTOMS */}
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.5rem' }}>
                    4. Customer Requirements & Reported Complaints
                  </div>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Specific complaints reported by walk-in customer (e.g. AC blowing warm air, brake squeal, engine oil change, vibration at high speed)"
                    value={walkInSymptoms}
                    onChange={e => setWalkInSymptoms(e.target.value)}
                    style={{ width: '100%', marginTop: '3px' }}
                  />
                </div>

                {/* 5. IMMEDIATE INTAKE CHECK-IN OPTION */}
                <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={walkInImmediateIntake}
                      onChange={e => setWalkInImmediateIntake(e.target.checked)}
                    />
                    <span style={{ color: 'var(--accent)' }}>Immediate Workshop Intake & Check-In</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginLeft: '24px', marginTop: '2px' }}>
                    Customer is handing over the car now. Moves status directly to Checked In / In Workshop.
                  </span>

                  {walkInImmediateIntake && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Fuel Level (%)</label>
                        <input
                          type="number"
                          className="input"
                          min={0}
                          max={100}
                          value={walkInIntakeFuel}
                          onChange={e => setWalkInIntakeFuel(Number(e.target.value))}
                          style={{ width: '100%', marginTop: '3px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Intake Condition / Exterior Notes</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Scratches on left fender, spare tire and jack present"
                          value={walkInIntakeNotes}
                          onChange={e => setWalkInIntakeNotes(e.target.value)}
                          style={{ width: '100%', marginTop: '3px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. COUNTER ADVANCE PAYMENT / DEPOSIT (OPTIONAL - SAME AS WALK-IN RENTAL) */}
                <div style={{ background: 'var(--surface-secondary)', padding: '1rem', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={walkInCollectPayment}
                      onChange={e => setWalkInCollectPayment(e.target.checked)}
                    />
                    <span style={{ color: 'var(--accent)' }}>💳 Collect Counter Advance Payment / Deposit Now</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginLeft: '24px', marginTop: '2px' }}>
                    Record upfront walk-in deposit or booking charge collected via UPI QR, card POS machine, or cash at workshop desk.
                  </span>

                  {walkInCollectPayment && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Deposit Amount (₹) *</label>
                        <input
                          type="number"
                          className="input"
                          min={1}
                          required={walkInCollectPayment}
                          placeholder="e.g. 1000"
                          value={walkInAdvancePayment || ''}
                          onChange={e => setWalkInAdvancePayment(Number(e.target.value))}
                          style={{ width: '100%', marginTop: '3px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Payment Method *</label>
                        <select
                          className="select"
                          value={walkInPaymentMethod}
                          onChange={e => setWalkInPaymentMethod(e.target.value as any)}
                          style={{ width: '100%', marginTop: '3px' }}
                        >
                          <option value="UPI">UPI / QR Code</option>
                          <option value="POS_CARD">Card Terminal (POS)</option>
                          <option value="CASH">Cash Counter</option>
                          <option value="BANK_TRANSFER">Bank Transfer / IMPS</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Reference / Txn ID</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. UPI-9846-928"
                          value={walkInTxRef}
                          onChange={e => setWalkInTxRef(e.target.value)}
                          style={{ width: '100%', marginTop: '3px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

              </div>

              <div className="modal-footer" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'var(--surface-secondary)' }}>
                <button
                  type="button"
                  className="btn-secondary button secondary"
                  onClick={() => setWalkInModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-gold button primary"
                  disabled={walkInSubmitting}
                  style={{ fontWeight: 700 }}
                >
                  {walkInSubmitting ? 'Registering Booking…' : 'Create Walk-In Job & Check In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL CONFIRMATION MODAL */}
      {cancelPromptOpen && activeJob && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-dialog" style={{ maxWidth: '450px', width: '90%' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: '#ef4444' }}>Cancel Service Job</h3>
              <button type="button" className="icon-button" onClick={() => setCancelPromptOpen(false)}>
                <IconCross />
              </button>
            </div>
            <form onSubmit={handleCancelServiceJob} style={{ padding: '1.25rem' }}>
              <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--muted)' }}>
                Are you sure you want to cancel service booking <strong>{activeJob.requestNumber}</strong>?
                This will release the reserved workshop capacity, notify the customer, and permanently lock the job.
              </p>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Cancellation Reason *</label>
                <textarea
                  className="input"
                  required
                  rows={3}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer cancelled due to travel / parts unavailable"
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn-secondary button secondary" onClick={() => setCancelPromptOpen(false)}>
                  Go Back
                </button>
                <button type="submit" className="btn-danger button danger" disabled={cancelling || !cancelReason.trim()}>
                  {cancelling ? 'Cancelling…' : 'Confirm Cancel Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DYNAMIC SERVICE PRICING & PACKAGES MODAL */}
      {pricingModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-dialog" style={{ maxWidth: '800px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚙️ Manage Service Packages & Pricing</span>
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Configure package prices, diagnostic upfront fees, and included features live across Mobile & Web.
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setPricingModalOpen(false);
                  setEditingCategoryKey(null);
                }}
              >
                <IconCross />
              </button>
            </div>

            <div style={{ padding: '1.25rem' }}>
              {editingCategoryKey ? (
                // EDIT CATEGORY FORM
                <div style={{ background: 'var(--surface-secondary)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>
                      Edit Pricing: {editingCategoryKey.replace(/-/g, ' ')}
                    </h4>
                    <button
                      type="button"
                      className="btn-secondary btn-sm button secondary small"
                      onClick={() => setEditingCategoryKey(null)}
                    >
                      ← Back to Category List
                    </button>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Target Hub / Branch Override</label>
                    <select
                      className="select"
                      value={editPricingHubId}
                      onChange={e => {
                        const hubId = e.target.value;
                        setEditPricingHubId(hubId);
                        const selectedCat = categories.find(c => c.categoryKey === editingCategoryKey);
                        if (selectedCat) {
                          const hubOverride = (selectedCat as any).hubPricing?.[hubId];
                          if (hubOverride) {
                            if (hubOverride.packagePricePaise) setEditPriceRupees(Math.round(Number(hubOverride.packagePricePaise) / 100));
                            if (hubOverride.diagnosticFeePaise) setEditDiagnosticFeeRupees(Math.round(Number(hubOverride.diagnosticFeePaise) / 100));
                            if (hubOverride.fixedPackageAvailable !== undefined) setEditPackageAvailable(hubOverride.fixedPackageAvailable);
                          } else {
                            const basePrice = selectedCat.packagePricePaise ? Math.round(Number(selectedCat.packagePricePaise) / 100) : 0;
                            const baseDiag = selectedCat.diagnosticFeePaise ? Math.round(Number(selectedCat.diagnosticFeePaise) / 100) : 500;
                            setEditPriceRupees(basePrice);
                            setEditDiagnosticFeeRupees(baseDiag);
                            setEditPackageAvailable(selectedCat.fixedPackageAvailable !== false);
                          }
                        }
                      }}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      <option value="all">🌐 All Branches / Hubs (Default Base Price)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          📍 {b.name} ({b.city})
                        </option>
                      ))}
                    </select>
                    <small style={{ color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                      {editPricingHubId === 'all'
                        ? 'Sets the default standard package price across all branches without explicit overrides.'
                        : 'Sets branch-specific pricing override specifically for this location.'}
                    </small>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Pricing Type *</label>
                      <select
                        className="select"
                        value={editPricingType}
                        onChange={e => setEditPricingType(e.target.value)}
                        style={{ width: '100%', marginTop: '4px' }}
                      >
                        <option value="FIXED">FIXED (Standard Package Fee)</option>
                        <option value="ESTIMATE_REQUIRED">ESTIMATE_REQUIRED (Diagnostic / Inspection Fee)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Diagnostic Upfront Fee (₹) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        value={editDiagnosticFeeRupees}
                        onChange={e => setEditDiagnosticFeeRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={editPackageAvailable}
                        onChange={e => setEditPackageAvailable(e.target.checked)}
                      />
                      <span>Enable Fixed Upfront Package Pricing</span>
                    </label>
                  </div>

                  {editPackageAvailable && (
                    <div style={{ marginTop: '1rem' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Base Package Price (₹) *</label>
                      <input
                        type="number"
                        className="input"
                        required
                        value={editPriceRupees}
                        onChange={e => setEditPriceRupees(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '4px' }}
                      />
                    </div>
                  )}

                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                      Included Package Features / Deliverables (one per line)
                    </label>
                    <textarea
                      className="input"
                      rows={5}
                      value={editFeaturesText}
                      onChange={e => setEditFeaturesText(e.target.value)}
                      placeholder="e.g. Engine Oil Flush&#10;Oil Filter Cartridge Replacement&#10;50-point Safety Check&#10;Complimentary Vacuum"
                      style={{ width: '100%', marginTop: '4px', fontFamily: 'inherit' }}
                    />
                  </div>

                  <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn-secondary button secondary"
                      onClick={() => setEditingCategoryKey(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-gold button primary"
                      disabled={savingCategoryPricing}
                      onClick={() => handleSaveCategoryPricing(editingCategoryKey)}
                    >
                      {savingCategoryPricing ? 'Saving Live…' : 'Save Changes Live'}
                    </button>
                  </div>
                </div>
              ) : (
                // LIST CATEGORIES
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted)' }}>Pricing View & Hub Overrides:</span>
                    <select
                      className="select"
                      value={editPricingHubId}
                      onChange={async e => {
                        const hId = e.target.value;
                        setEditPricingHubId(hId);
                        const cats = await api.serviceCategories(user, hId === 'all' ? undefined : hId);
                        if (Array.isArray(cats)) setCategories(cats);
                      }}
                      style={{ minWidth: '240px', padding: '0.4rem 0.6rem' }}
                    >
                      <option value="all">🌐 All Branches (Base Default)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>📍 {b.name} ({b.city})</option>
                      ))}
                    </select>
                  </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {categories.map(cat => {
                    const price = cat.packagePricePaise ? Math.round(Number(cat.packagePricePaise) / 100) : null;
                    const diagFee = cat.diagnosticFeePaise ? Math.round(Number(cat.diagnosticFeePaise) / 100) : 500;
                    return (
                      <div
                        key={cat.categoryKey}
                        style={{
                          background: 'var(--surface-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.95rem' }}>{cat.title}</strong>
                            <span className="code-pill">{cat.categoryKey}</span>
                            <span className={`badge ${cat.pricingType === 'FIXED' ? 'badge-success' : 'badge-warning'}`}>
                              {cat.pricingType || 'FIXED'}
                            </span>
                          </div>
                          <p style={{ margin: '4px 0 6px', fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {cat.description}
                          </p>
                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                            <span>Package Price: <strong style={{ color: 'var(--accent)' }}>{price !== null ? `₹${price.toLocaleString('en-IN')}` : 'Quote on Diagnosis'}</strong></span>
                            <span>Diagnostic Fee: <strong>₹{diagFee.toLocaleString('en-IN')}</strong></span>
                            <span>Features: <strong>{(cat.packageFeatures || []).length} included</strong></span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm button secondary small"
                          onClick={() => {
                            setEditingCategoryKey(cat.categoryKey);
                            setEditPriceRupees(price || 0);
                            setEditDiagnosticFeeRupees(diagFee);
                            setEditPricingType(cat.pricingType || 'FIXED');
                            setEditPackageAvailable(cat.fixedPackageAvailable !== false && price !== null);
                            setEditFeaturesText((cat.packageFeatures || []).join('\n'));
                          }}
                        >
                          Edit Pricing
                        </button>
                      </div>
                    );
                  })}
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
