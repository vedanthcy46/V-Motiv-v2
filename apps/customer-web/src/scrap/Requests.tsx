import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ConfirmDialog, Modal, TextareaField } from '@vmotiv/ui';
import {
  CERTIFICATE_NAMES, DISPUTE_CATEGORY_LABELS, customerAction, formatPaise, formatPaiseRange, progressStage, verificationText,
} from '../../../customer-mobile/src/services/scrap-form';
import {
  DISPUTE_STATUS_TEXT, DOCUMENT_STATUS_TEXT, OBLIGATION_STATUS_TEXT, PAYMENT_STATE_TEXT, PICKUP_STATUS_TEXT, REGISTRATION_TEXT, documentName, formatDate, formatDateTime,
  isClosedStatus, payerText, timeLeftText,
} from '../../../customer-mobile/src/services/scrap-text';
import { isDraftView, type ScrapDetails, type ScrapDraftView, type ScrapListRow } from '../../../customer-mobile/src/services/scrap-types';
import { navigate } from './navigate';
import { scrapPath } from './route';
import { scrapApi } from './session';
import { webErrorMessage } from './messages';
import { ChoiceGroup, Link, LinkButton, Notice, PageShell, ProgressTrack, Section, StatusPill } from './ui';
import { Wizard } from './Wizard';

const SHOW_REGISTRATION = ['SCRAPPING_COMPLETED', 'REGISTRATION_UPDATE_PENDING', 'COMPLETED'];
const rowName = (row: ScrapListRow) => (row.vehicle ? [row.vehicle.manufacturingYear, row.vehicle.make, row.vehicle.model].filter(Boolean).join(' ') : '') || 'Unfinished request';

// ------------------------------------------------------------------------------------------------------------------------------------
// Start page
// ------------------------------------------------------------------------------------------------------------------------------------

const HOW_IT_WORKS = [
  { title: 'Tell us about your vehicle', body: 'Answer a few questions about its condition and ownership. We save as you go.' },
  { title: 'We review and inspect', body: 'Our team reviews your request and an inspector checks the vehicle.' },
  { title: 'You get an offer', body: 'We get a quotation from an authorised scrapping facility. You decide whether to accept.' },
  { title: 'Collection and scrapping', body: 'The vehicle is collected and taken to the facility, which scraps it.' },
  { title: 'Certificates and registration', body: 'The facility issues the official certificates. We check them and follow up on the registration.' },
];

/** What happens, what V MOTIV does and does not do, and the way in. V MOTIV arranges scrapping with an authorised facility; it is not the facility and not a government service. */
export function ScrapHome() {
  const [rows, setRows] = useState<ScrapListRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setRows((await scrapApi.list()).items); } catch (e) { setError(webErrorMessage(e, 'We could not load your requests.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const drafts = rows.filter(row => row.status === 'DRAFT');
  const active = rows.filter(row => row.status !== 'DRAFT' && !isClosedStatus(row.status));
  const attention = rows.find(row => row.status !== 'DRAFT' && customerAction(row.status)) ?? null;

  return (
    <PageShell title="Retire your old vehicle responsibly" subtitle="V MOTIV arranges the scrapping of your vehicle with an authorised scrapping facility, and keeps you updated at every step.">
      <div className="flex flex-wrap gap-3">
        <LinkButton to={{ name: 'new' }}>{drafts.length ? 'Start a new request' : 'Start a request'}</LinkButton>
        {rows.length > 0 ? <LinkButton to={{ name: 'list' }} variant="outline">{active.length ? `My requests (${active.length} in progress)` : 'My requests'}</LinkButton> : null}
      </div>

      {error ? <Notice tone="warning" action={{ label: 'Try again', onClick: () => void load() }}>{error}</Notice> : null}

      {attention ? (
        <Link to={{ name: 'request', id: attention.id }} className="block">
          <Notice tone="warning">{attention.status === 'OFFER_PENDING_CUSTOMER' ? 'Your offer is ready. Review it.' : 'We need something from you. See what.'}</Notice>
        </Link>
      ) : null}

      {drafts.map(draft => (
        <Link key={draft.id} to={{ name: 'request', id: draft.id }} className="block rounded-2xl border border-base-300 p-4 hover:border-primary">
          <StatusPill status="DRAFT" label="Unfinished" />
          <p className="mt-2 font-bold">{rowName(draft)}</p>
          <p className="text-sm font-medium text-primary">Continue where you left off</p>
        </Link>
      ))}

      <Section title="How it works">
        <ol className="grid gap-3">
          {HOW_IT_WORKS.map((item, index) => (
            <li key={item.title}><p className="font-bold">{index + 1}. {item.title}</p><p className="text-sm text-base-content/75">{item.body}</p></li>
          ))}
        </ol>
      </Section>

      <Section title="Good to know">
        <ul className="grid list-disc gap-2 pl-5 text-sm text-base-content/80">
          <li>V MOTIV is not the scrapping facility and not a government service. The facility does the scrapping and issues the official certificates.</li>
          <li>Signing in with Google does not prove you own the vehicle. We may ask for proof of ownership.</li>
          <li>Any estimate is only a guide. You are never bound to anything until you accept an offer.</li>
          <li>You can cancel before your vehicle is collected.</li>
        </ul>
      </Section>

      <Notice tone="info" title="Photos and documents">Adding photos and documents is not on the website yet. The V MOTIV app and our team can help if we need any.</Notice>
    </PageShell>
  );
}

// ------------------------------------------------------------------------------------------------------------------------------------
// List
// ------------------------------------------------------------------------------------------------------------------------------------

export function MyRequests() {
  const [rows, setRows] = useState<ScrapListRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const page = await scrapApi.list();
      setRows(page.items);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(webErrorMessage(e, 'We could not load your requests.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await scrapApi.list(cursor);
      setRows(current => [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(webErrorMessage(e, 'We could not load more.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const active = rows.filter(row => !isClosedStatus(row.status));
  const history = rows.filter(row => isClosedStatus(row.status));

  const card = (row: ScrapListRow) => {
    const estimate = row.estimate ? formatPaiseRange(row.estimate.minPaise, row.estimate.maxPaise) : null;
    const needsYou = customerAction(row.status);
    return (
      <li key={row.id}>
        <Link to={{ name: 'request', id: row.id }} className={`block rounded-2xl border bg-base-100 p-4 hover:border-primary ${needsYou ? 'border-primary' : 'border-base-300'}`}>
          <div className="flex items-start justify-between gap-3">
            <span className="font-bold">{rowName(row)}</span>
            <StatusPill status={row.status} label={row.statusLabel ?? row.status} />
          </div>
          <p className="mt-1 text-xs text-base-content/60">{row.vehicle?.registrationNumber ? `${row.vehicle.registrationNumber} · ` : ''}{row.requestNumber} · {formatDate(row.submittedAt ?? row.updatedAt ?? row.createdAt)}</p>
          {needsYou === 'FINISH_DRAFT' ? <p className="mt-1 text-sm font-medium text-primary">Continue where you left off</p> : null}
          {needsYou === 'RESPOND_TO_OFFER' ? <p className="mt-1 text-sm font-medium text-primary">Your offer is ready</p> : null}
          {needsYou === 'PROVIDE_DOCUMENTS' ? <p className="mt-1 text-sm font-medium text-warning">We need some documents</p> : null}
          {estimate && !needsYou ? <p className="mt-1 text-sm text-base-content/75">Estimate {estimate}</p> : null}
        </Link>
      </li>
    );
  };

  return (
    <PageShell title="My scrapping requests" back={{ to: { name: 'home' }, label: 'Scrapping home' }}>
      {loading ? <p role="status" className="text-sm text-base-content/70">Loading your requests…</p> : null}
      {error ? <Notice tone="danger" action={{ label: 'Try again', onClick: () => void load() }}>{error}</Notice> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="grid justify-items-start gap-3 py-6">
          <h2 className="text-lg font-bold">No scrapping requests yet</h2>
          <p className="text-sm text-base-content/75">When you scrap a car with V MOTIV, you can follow every step here.</p>
          <LinkButton to={{ name: 'new' }}>Scrap a car</LinkButton>
        </div>
      ) : null}
      {active.length ? <section aria-labelledby="active-heading" className="grid gap-2"><h2 id="active-heading" className="text-xs font-bold uppercase tracking-wide text-base-content/60">In progress</h2><ul className="grid gap-2">{active.map(card)}</ul></section> : null}
      {history.length ? <section aria-labelledby="history-heading" className="grid gap-2"><h2 id="history-heading" className="text-xs font-bold uppercase tracking-wide text-base-content/60">History</h2><ul className="grid gap-2">{history.map(card)}</ul></section> : null}
      {cursor ? <div><Button variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Show more</Button></div> : null}
    </PageShell>
  );
}

// ------------------------------------------------------------------------------------------------------------------------------------
// One request: a draft opens the form, anything submitted opens the details
// ------------------------------------------------------------------------------------------------------------------------------------

export function RequestPage({ id }: { id: string }) {
  const [view, setView] = useState<ScrapDetails | ScrapDraftView | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setError('');
    scrapApi.get(id).then(result => { if (!cancelled) setView(result); }).catch(e => { if (!cancelled) setError(webErrorMessage(e, 'We could not load this request.')); });
    return () => { cancelled = true; };
  }, [id, attempt]);

  if (error) {
    return (
      <PageShell title="Scrapping request" back={{ to: { name: 'list' }, label: 'My requests' }}>
        <Notice tone="danger">{error}</Notice>
        <div><Button onClick={() => setAttempt(count => count + 1)}>Try again</Button></div>
      </PageShell>
    );
  }
  if (!view) return <PageShell title="Scrapping request"><p role="status" className="text-sm text-base-content/70">Loading…</p></PageShell>;
  return isDraftView(view) ? <Wizard key={view.id} initial={view} /> : <Details key={view.id} initial={view} />;
}

// ------------------------------------------------------------------------------------------------------------------------------------
// Details
// ------------------------------------------------------------------------------------------------------------------------------------

function Details({ initial }: { initial: ScrapDetails }) {
  const requestId = initial.id;
  const [data, setData] = useState<ScrapDetails>(initial);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'cancel' | 'concern' | 'accept' | 'reject'>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const busyRef = useRef(false); // a second click while an action is running does nothing
  const justSubmitted = new URLSearchParams(window.location.search).get('submitted') === '1';

  const load = useCallback(async () => {
    setError('');
    try {
      const view = await scrapApi.get(requestId);
      if (isDraftView(view)) { navigate(scrapPath({ name: 'request', id: requestId }), { replace: true }); return; }
      setData(view);
    } catch (e) {
      setError(webErrorMessage(e, 'We could not refresh this request.'));
    }
  }, [requestId]);

  // A change made by our team while the tab was in the background appears when the person returns to it.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError('');
    try {
      await action();
      setDialog(null);
      await load();
    } catch (e) {
      setActionError(webErrorMessage(e));
      await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const closed = isClosedStatus(data.status);
  const stage = progressStage(data.status);
  const action = customerAction(data.status);
  const offer = data.offer;
  const offerOpen = offer?.status === 'SENT_TO_CUSTOMER' && data.status === 'OFFER_PENDING_CUSTOMER';
  const estimateText = data.estimate ? formatPaiseRange(data.estimate.minPaise, data.estimate.maxPaise) : null;
  const vehicleName = data.vehicle ? [data.vehicle.manufacturingYear, data.vehicle.make, data.vehicle.model, data.vehicle.variant].filter(Boolean).join(' ') : '';
  const offerAmount = offer ? formatPaise(offer.customerPayoutPaise) ?? '' : '';

  return (
    <PageShell title={data.requestNumber} subtitle={vehicleName} back={{ to: { name: 'list' }, label: 'My requests' }}>
      {justSubmitted ? <Notice tone="success">Your request has been submitted. We will review it and keep you updated here and in your notifications.</Notice> : null}
      {error ? <Notice tone="warning" action={{ label: 'Try again', onClick: () => void load() }}>{error} Showing what we last loaded.</Notice> : null}
      {actionError && !dialog ? <Notice tone="danger">{actionError}</Notice> : null}

      <Section>
        <div><StatusPill status={data.status} label={data.statusLabel} /></div>
        <p className="leading-relaxed">{data.statusDescription}</p>
        {data.holdNotice ? <Notice tone="warning">{data.holdNotice}</Notice> : null}
        {!closed ? <ProgressTrack stage={stage} /> : null}
      </Section>

      {action === 'PROVIDE_DOCUMENTS' ? <Notice tone="warning">We need some documents from you. They are listed below. Adding them on the website is coming in an update, so our team will contact you about how to send them.</Notice> : null}

      {offer ? (
        <Section title="Your offer">
          <p className="text-3xl font-extrabold" aria-label={`Offer ${offerAmount}`}>{offerAmount}</p>
          <p className="text-sm text-base-content/75">{payerText(offer.payerType, offer.facilityName)}</p>
          {offerOpen ? <p className="text-sm font-semibold text-warning">{timeLeftText(offer.expiresAt)}</p> : null}
          {offer.status === 'ACCEPTED' ? <Notice tone="success">You accepted this offer.</Notice> : null}
          {offer.status === 'REJECTED' ? <Notice tone="info">You rejected this offer.</Notice> : null}
          {offer.status === 'EXPIRED' ? <Notice tone="warning">This offer has expired. We will get a new quotation for you.</Notice> : null}
          {offerOpen ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => { setActionError(''); setDialog('accept'); }} disabled={busy}>Accept offer</Button>
              <Button variant="outline" onClick={() => { setActionError(''); setDialog('reject'); }} disabled={busy}>Reject offer</Button>
            </div>
          ) : null}
        </Section>
      ) : data.estimate ? (
        <Section title="Estimate">
          {estimateText ? (
            <>
              <p className="text-2xl font-extrabold" aria-label={`Estimate ${estimateText}`}>{estimateText}</p>
              <p className="text-sm text-base-content/70">This is a rough guide, not an offer. The real offer comes after inspection and a quotation from an authorised facility.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold">Quotation required</p>
              <p className="text-sm text-base-content/70">We cannot give a reliable estimate for this vehicle yet. We will get a quotation from an authorised scrapping facility.</p>
            </>
          )}
        </Section>
      ) : null}

      {data.documents.length > 0 ? (
        <Section title="Documents and photos">
          <ul className="grid gap-3">
            {data.documents.map(document => (
              <li key={document.id}>
                <p className="font-bold">{documentName(document.documentType)}</p>
                <p className={`text-sm ${document.status === 'REJECTED' ? 'text-error' : 'text-base-content/75'}`}>{DOCUMENT_STATUS_TEXT[document.status] ?? document.status}</p>
                {document.rejectionReason ? <p className="text-sm text-base-content/60">Why: {document.rejectionReason}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {data.pickup ? (
        <Section title="Collection">
          <p className="font-bold">{formatDateTime(data.pickup.windowStart)} to {formatDateTime(data.pickup.windowEnd)}</p>
          <p className="text-sm text-base-content/75">{PICKUP_STATUS_TEXT[data.pickup.status] ?? data.pickup.status}</p>
          {data.pickup.agentName ? <p className="text-sm">Driver: {data.pickup.agentName}</p> : null}
          {data.pickup.transportProvider ? <p className="text-sm text-base-content/60">Transport: {data.pickup.transportProvider}</p> : null}
        </Section>
      ) : null}

      {data.certificates.length > 0 || SHOW_REGISTRATION.includes(data.status) ? (
        <Section title="Certificates and registration">
          <p className="text-sm text-base-content/70">The scrapping facility issues these. V MOTIV checks the document it receives. We tell you exactly how far each has been checked.</p>
          <ul className="grid gap-3">
            {data.certificates.map(certificate => (
              <li key={`${certificate.type}-${certificate.officialReference}`}>
                <p className="font-bold">{CERTIFICATE_NAMES[certificate.type] ?? certificate.type}</p>
                <p className="text-sm text-base-content/60">Reference {certificate.officialReference}{certificate.issuedAt ? ` · issued ${formatDate(certificate.issuedAt)}` : ''}</p>
                <p className={`text-sm font-medium ${certificate.verificationState === 'VERIFIED' ? 'text-success' : ''}`}>{verificationText(certificate.verificationState, certificate.verificationMethod)}</p>
              </li>
            ))}
            {SHOW_REGISTRATION.includes(data.status) ? <li><p className="font-bold">Registration update</p><p className="text-sm">{REGISTRATION_TEXT[data.registrationStatus] ?? data.registrationStatus}</p></li> : null}
          </ul>
        </Section>
      ) : null}

      {data.payment.obligations.length > 0 ? (
        <Section title="Payment">
          <ul className="grid gap-3">
            {data.payment.obligations.map((obligation, index) => (
              <li key={index}><p className="font-bold">{formatPaise(obligation.amountPaise)}</p><p className="text-sm text-base-content/75">{OBLIGATION_STATUS_TEXT[obligation.status] ?? obligation.status}</p></li>
            ))}
          </ul>
          <p className="text-sm text-base-content/60">{PAYMENT_STATE_TEXT[data.payment.state] ?? data.payment.state}</p>
        </Section>
      ) : null}

      {data.vehicle ? (
        <Section title="Your vehicle">
          <p className="font-bold">{vehicleName}</p>
          <p className="text-sm text-base-content/75">{data.vehicle.registrationNumber}{data.vehicle.odometerKm ? ` · ${data.vehicle.odometerKm.toLocaleString('en-IN')} km` : ''} · {data.vehicle.fuelType.toLowerCase()}</p>
          <p className="text-sm text-base-content/60">{data.vehicle.identityStatus === 'CHECKED_BY_V_MOTIV' ? 'Details checked by V MOTIV' : 'Details as you declared them. We will check them during inspection.'}</p>
          {data.pickupAddress ? <p className="text-sm text-base-content/60">Pickup: {[data.pickupAddress.line1, data.pickupAddress.city, data.pickupAddress.pincode].filter(Boolean).join(', ')}</p> : null}
        </Section>
      ) : null}

      {data.disputes.length > 0 ? (
        <Section title="Your concerns">
          <ul className="grid gap-3">
            {data.disputes.map(dispute => (
              <li key={dispute.id}><p className="font-bold">{DISPUTE_CATEGORY_LABELS.find(item => item.value === dispute.category)?.label ?? dispute.category}</p><p className="text-sm text-base-content/75">{DISPUTE_STATUS_TEXT[dispute.status] ?? dispute.status} · {formatDate(dispute.createdAt)}</p></li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Progress so far">
        <ol className="grid gap-3">
          {[...data.timeline].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`} aria-current={index === 0 ? 'step' : undefined}>
              <p className={index === 0 ? 'font-extrabold' : 'font-semibold'}>{entry.label}</p>
              <p className="text-xs text-base-content/60">{formatDateTime(entry.at)}</p>
              {entry.note ? <p className="text-sm text-base-content/75">{entry.note}</p> : null}
            </li>
          ))}
        </ol>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => { setActionError(''); setDialog('concern'); }} disabled={busy}>Raise a concern</Button>
        {!closed ? <Button variant="outline" onClick={() => { setActionError(''); setDialog('cancel'); }} disabled={busy}>Cancel request</Button> : null}
      </div>
      <p className="text-center text-xs leading-relaxed text-base-content/60">
        V MOTIV arranges scrapping with an authorised facility. Certificates and registration updates come from the facility and the authorities, not from V MOTIV.
      </p>

      {dialog === 'accept' && offer ? (
        <ConfirmDialog
          title={`Accept this offer of ${offerAmount}?`}
          message={<><p>{payerText(offer.payerType, offer.facilityName)}. After you accept we will arrange collection of your vehicle. You can still cancel before it is collected.</p>{actionError ? <p className="mt-2 text-error" role="alert">{actionError}</p> : null}</>}
          confirmLabel="Accept offer"
          cancelLabel="Not now"
          onConfirm={() => run(() => scrapApi.respondToOffer(requestId, offer.id, 'ACCEPTED'))}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'reject' && offer ? (
        <ConfirmDialog
          title="Reject this offer?"
          message={<><p>This will close your request. You can start a new one later.</p>{actionError ? <p className="mt-2 text-error" role="alert">{actionError}</p> : null}</>}
          confirmLabel="Reject offer"
          cancelLabel="Not now"
          tone="danger"
          onConfirm={() => run(() => scrapApi.respondToOffer(requestId, offer.id, 'REJECTED'))}
          onCancel={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'cancel' ? (
        <Modal
          title="Cancel this request?"
          size="sm"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={event => { event.preventDefault(); if (cancelReason.trim().length >= 3) void run(async () => { await scrapApi.cancel(requestId, cancelReason.trim(), data.version); setCancelReason(''); }); }}
          footer={<><Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={busy}>Keep my request</Button><Button type="submit" variant="danger" loading={busy} disabled={cancelReason.trim().length < 3}>Cancel request</Button></>}
        >
          <TextareaField label="Why are you cancelling?" required maxLength={500} value={cancelReason} onChange={event => setCancelReason(event.target.value)} />
          {actionError ? <p className="mt-2 text-sm text-error" role="alert">{actionError}</p> : null}
        </Modal>
      ) : null}

      {dialog === 'concern' ? (
        <Modal
          title="Raise a concern"
          size="md"
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={event => { event.preventDefault(); if (category && description.trim().length >= 10) void run(async () => { await scrapApi.raiseConcern(requestId, category, description.trim()); setCategory(undefined); setDescription(''); }); }}
          footer={<><Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={busy}>Close</Button><Button type="submit" loading={busy} disabled={!category || description.trim().length < 10}>Send concern</Button></>}
        >
          <div className="grid gap-4">
            <p className="text-sm text-base-content/75">Tell us what is wrong. Our team will look into it, and your request is paused while they do.</p>
            <ChoiceGroup name="concern.category" label="What is it about?" options={DISPUTE_CATEGORY_LABELS} value={category} onChange={setCategory} />
            <TextareaField label="What happened?" required maxLength={2000} hint="At least 10 characters." value={description} onChange={event => setDescription(event.target.value)} />
            {actionError ? <p className="text-sm text-error" role="alert">{actionError}</p> : null}
          </div>
        </Modal>
      ) : null}
    </PageShell>
  );
}
