import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ConfirmDialog, TextField, TextareaField } from '@vmotiv/ui';
import { DraftSync, type SaveState } from '../../../customer-mobile/src/services/scrap-sync';
import {
  STEPS, STEP_SECTIONS, diffDraft, draftFromServer, emptyDraft, fieldErrorsFrom, firstIncompleteStep, isElectric, newSubmissionKey, pruneAnswers,
  scrapErrorMessage, stepForField, stepProblems, visibleQuestions,
  type DraftPatch, type DraftState, type QuestionDef, type QuestionnaireDefinition, type StepId,
} from '../../../customer-mobile/src/services/scrap-form';
import { isDraftView, type ScrapDraftView } from '../../../customer-mobile/src/services/scrap-types';
import { navigate } from './navigate';
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from './local-draft';
import { scrapPath } from './route';
import { scrapApi, useSession } from './session';
import { webErrorMessage } from './messages';
import { ChoiceGroup, CheckboxField, Notice, PageShell, SaveIndicator, Section, YesNo } from './ui';

const digits = (text: string) => text.replace(/\D/g, '');
// Keeps only digits, and at most `max` of them. The limit is applied here, not with the browser's maxLength, which counts typed letters and
// separators too (so "2,008" or a stray letter would cut a digit off).
const toNumber = (text: string, max = 9): number | undefined => { const clean = digits(text).slice(0, max); return clean ? Number(clean) : undefined; };

/** Moves keyboard focus to the first field that has a problem, so people using a keyboard or a screen reader land on it. */
function focusFirstInvalid(root: HTMLElement | null) {
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!target) return;
  const focusable = target.matches('input,select,textarea,button') ? target : target.querySelector<HTMLElement>('input,select,textarea');
  (focusable ?? target).focus();
  (focusable ?? target).scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/**
 * The scrapping request form. Answers are saved to the account as they are typed (so they follow the person to the app and other devices) and a
 * copy is kept in this browser until the server confirms it. What a field must contain is the server's decision; this form only asks, shows what
 * the server refused, and never blocks the rest from being saved because one field is wrong.
 */
export function Wizard({ initial }: { initial?: ScrapDraftView }) {
  const { profile } = useSession();
  const userId = profile?.id;
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const [definition, setDefinition] = useState<QuestionnaireDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [stepIndex, setStepIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState<Partial<Record<StepId, boolean>>>({});
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  const syncRef = useRef<DraftSync | null>(null);
  const draftRef = useRef<DraftState>(emptyDraft());
  const keyRef = useRef(newSubmissionKey());
  const submittingRef = useRef(false);
  const definitionRef = useRef<QuestionnaireDefinition | null>(null);
  const requestId = initial?.id ?? null;

  const step = STEPS[stepIndex]!;

  // ------------------------------------------------------------------------------------------------------------------------------
  // Loading, resuming
  // ------------------------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const sync = new DraftSync(
      {
        saveDraft: (id, version, patch) => scrapApi.saveDraft(id, version, patch),
        loadDraft: async id => {
          const view = await scrapApi.get(id);
          if (!isDraftView(view)) { navigate(scrapPath({ name: 'request', id }), { replace: true }); throw Object.assign(new Error('submitted'), { status: 409, code: 'SCRAP_NOT_EDITABLE' }); }
          return { version: view.version, draft: draftFromServer(view.draft) };
        },
      },
      {
        state: setSaveState,
        fieldErrors: setFieldErrors,
        conflict: server => { draftRef.current = server; setDraft(server); setNotice('This request was changed on another device. We loaded the latest version.'); },
      },
    );
    syncRef.current = sync;

    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const questions = await scrapApi.questionnaire();
        if (cancelled) return;
        definitionRef.current = questions;
        setDefinition(questions);
        const server = initial ? draftFromServer(initial.draft) : null;
        // Anything typed in this browser that never reached the server is kept: closing the tab or losing the connection must not lose answers.
        const local = readLocalDraft(userId, requestId);
        const unsaved = Boolean(local && (!server || diffDraft(server, local)));
        const start = unsaved ? local! : server ?? emptyDraft();
        draftRef.current = start;
        setDraft(start);
        if (initial && server) sync.attach(initial.id, initial.version, server, start);
        const first = firstIncompleteStep(start, questions);
        setStepIndex(first ? STEPS.findIndex(item => item.id === first) : STEPS.length - 1);
        if (unsaved && initial) { setNotice('We restored answers that had not been saved yet.'); sync.update(start); }
        else if (unsaved) setNotice('We restored the answers you had started typing.');
      } catch (error) {
        if (!cancelled) setLoadError(webErrorMessage(error, 'We could not open the form.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const leaving = () => { if (sync.hasUnsavedChanges) void sync.flush(); };
    const onHide = () => { if (document.visibilityState === 'hidden') leaving(); };
    const warn = (event: BeforeUnloadEvent) => { if (sync.hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', warn);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', warn);
      void sync.flush().finally(() => sync.dispose()); // leaving the page: send what has not gone yet
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // When the step changes, move to its heading; when the person tried to continue and something is wrong, move to the first problem.
  useEffect(() => { if (!loading) heading.current?.focus({ preventScroll: false }); }, [stepIndex, loading]);
  useEffect(() => { if (focusTick) window.setTimeout(() => focusFirstInvalid(root.current), 0); }, [focusTick]);

  // ------------------------------------------------------------------------------------------------------------------------------
  // Changing answers
  // ------------------------------------------------------------------------------------------------------------------------------------
  const change = useCallback((mutate: (current: DraftState) => DraftState) => {
    let next = mutate(draftRef.current);
    const questions = definitionRef.current;
    if (questions) next = { ...next, answers: pruneAnswers(questions, next.answers, next.vehicle) };
    draftRef.current = next;
    setDraft(next);
    setSubmitError('');
    writeLocalDraft(userId, syncRef.current?.requestId ?? null, next);
    syncRef.current?.update(next);
  }, [userId]);

  const setVehicle = (patch: Partial<DraftState['vehicle']>) => change(current => ({ ...current, vehicle: { ...current.vehicle, ...patch } }));
  const setAnswer = (key: string, value: string | boolean) => change(current => ({ ...current, answers: { ...current.answers, [key]: value } }));
  const setOwnership = (patch: Partial<DraftState['ownership']>) => change(current => ({ ...current, ownership: { ...current.ownership, ...patch } }));
  const setPickup = (patch: Partial<DraftState['pickupAddress']>) => change(current => ({ ...current, pickupAddress: { ...current.pickupAddress, ...patch } }));

  /** Creates the draft the first time the person moves on from the first step. Safe to retry: the key returns the same draft. */
  const ensureCreated = async (): Promise<boolean> => {
    const sync = syncRef.current!;
    if (sync.attached) return true;
    setCreating(true);
    try {
      const patch = diffDraft(emptyDraft(), draftRef.current) ?? {};
      const { request } = await scrapApi.createDraft({ submissionKey: keyRef.current, draft: patch as DraftPatch });
      sync.attach(request.id, request.version, draftFromServer(request.draft), draftRef.current);
      writeLocalDraft(userId, request.id, draftRef.current);
      clearLocalDraft(userId, null);
      // The address now names this request, so a reload or a shared link reopens it instead of starting a second form. The form stays as it is.
      window.history.replaceState({}, '', scrapPath({ name: 'request', id: request.id }));
      void sync.save();
      return true;
    } catch (error) {
      const fields = fieldErrorsFrom(error);
      if (Object.keys(fields).length) { setFieldErrors(fields); setAttempted(current => ({ ...current, VEHICLE: true })); setFocusTick(tick => tick + 1); }
      else setNotice(webErrorMessage(error, 'We could not save your request.'));
      return false;
    } finally {
      setCreating(false);
    }
  };

  // ------------------------------------------------------------------------------------------------------------------------------
  // Moving between steps, submitting
  // ------------------------------------------------------------------------------------------------------------------------------------
  const goNext = async () => {
    setAttempted(current => ({ ...current, [step.id]: true }));
    setNotice('');
    const own = stepProblems(step.id, draftRef.current, definition);
    const server = Object.keys(fieldErrors).filter(field => stepForField(field, definition) === step.id);
    if (own.length || server.length) { setFocusTick(tick => tick + 1); return; }
    if (step.id === 'VEHICLE' && !(await ensureCreated())) return;
    if (!syncRef.current?.attached) return;
    setStepIndex(index => Math.min(STEPS.length - 1, index + 1));
  };

  const goBack = () => { if (stepIndex > 0) setStepIndex(index => index - 1); else navigate(scrapPath({ name: 'home' })); };
  const jumpTo = (id: StepId) => setStepIndex(STEPS.findIndex(item => item.id === id));

  const submit = async () => {
    const sync = syncRef.current;
    if (!sync || submittingRef.current) return; // a second click while the first is still running does nothing
    const missing = firstIncompleteStep(draftRef.current, definition);
    if (missing) { setAttempted(current => ({ ...current, [missing]: true })); jumpTo(missing); setSubmitError('Some answers are still needed.'); setFocusTick(tick => tick + 1); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = await sync.flush();
      if (!saved && Object.keys(sync.fieldErrors).length) {
        const target = stepForField(Object.keys(sync.fieldErrors)[0]!, definition);
        setAttempted(current => ({ ...current, [target]: true }));
        jumpTo(target);
        setSubmitError('Some answers need fixing before you can submit.');
        setFocusTick(tick => tick + 1);
        return;
      }
      if (!saved) { setSubmitError('We could not save your answers yet, so nothing was submitted. Check your connection and try again. Your answers are kept in this browser.'); return; }
      const result = await scrapApi.submit(sync.requestId!);
      clearLocalDraft(userId, sync.requestId);
      sync.dispose();
      navigate(`${scrapPath({ name: 'request', id: result.request.id })}${result.alreadySubmitted ? '' : '?submitted=1'}`, { replace: true });
    } catch (error) {
      const fields = fieldErrorsFrom(error);
      if (Object.keys(fields).length) {
        setFieldErrors(fields);
        const target = stepForField(Object.keys(fields)[0]!, definition);
        setAttempted(current => ({ ...current, [target]: true }));
        jumpTo(target);
        setSubmitError('Some answers need fixing before you can submit.');
        setFocusTick(tick => tick + 1);
      } else {
        setSubmitError(webErrorMessage(error, 'We could not submit your request.'));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const discard = async () => {
    const sync = syncRef.current;
    try { if (sync?.requestId) await scrapApi.deleteDraft(sync.requestId); } catch (error) { setConfirmDelete(false); setNotice(webErrorMessage(error, 'We could not delete this draft.')); return; }
    clearLocalDraft(userId, sync?.requestId ?? null);
    clearLocalDraft(userId, null);
    sync?.dispose();
    setConfirmDelete(false);
    navigate(scrapPath({ name: 'home' }), { replace: true });
  };

  // ------------------------------------------------------------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------------------------------------------------------------------
  // Problems are shown for a step only after the person has tried to continue from it, so nobody is told off for a field they are still typing.
  const errorFor = (field: string): string | undefined => {
    const owner = stepForField(field, definition);
    if (!attempted[owner]) return undefined;
    return fieldErrors[field] ?? stepProblems(owner, draft, definition).find(problem => problem.field === field)?.message;
  };

  const questionsFor = (id: StepId) => {
    const sections = STEP_SECTIONS[id] ?? [];
    return definition ? visibleQuestions(definition, draft.answers, draft.vehicle).filter(question => sections.includes(question.section)) : [];
  };
  const summary = useMemo(() => (definition ? visibleQuestions(definition, draft.answers, draft.vehicle) : []), [definition, draft.answers, draft.vehicle]);
  const labelOf = (question: QuestionDef, value: unknown) => (question.type === 'boolean' ? (value ? 'Yes' : 'No') : question.type === 'choice' ? question.options?.find(option => option.value === value)?.label ?? String(value) : String(value));

  const questionField = (question: QuestionDef) => {
    const error = errorFor(`answers.${question.key}`);
    const value = draft.answers[question.key];
    const name = `answers.${question.key}`;
    if (question.type === 'boolean') return <YesNo key={question.key} name={name} label={question.label} help={question.help} required={question.required} error={error} value={typeof value === 'boolean' ? value : undefined} onChange={next => setAnswer(question.key, next)} />;
    if (question.type === 'choice') return <ChoiceGroup key={question.key} name={name} label={question.label} help={question.help} required={question.required} error={error} options={question.options ?? []} value={typeof value === 'string' ? value : undefined} onChange={next => setAnswer(question.key, next)} />;
    return <TextareaField key={question.key} name={name} label={question.label} hint={question.help} required={question.required} error={error} maxLength={question.maxLength} value={typeof value === 'string' ? value : ''} onChange={event => setAnswer(question.key, event.target.value)} />;
  };

  if (loading) {
    return <PageShell title="Scrap a car"><p role="status" className="text-sm text-base-content/70">Opening the form…</p></PageShell>;
  }
  if (loadError || !definition) {
    return (
      <PageShell title="Scrap a car" back={{ to: { name: 'home' }, label: 'Back' }}>
        <Notice tone="danger">{loadError || 'The questions could not be loaded.'}</Notice>
        <div><Button onClick={() => setReload(count => count + 1)}>Try again</Button></div>
      </PageShell>
    );
  }

  const electric = isElectric(draft.vehicle);
  const vehicleFields = (
    <Section title="Vehicle details">
      <TextField name="vehicle.registrationNumber" label="Registration number" required autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="KA01AB1234" value={draft.vehicle.registrationNumber ?? ''} onChange={event => setVehicle({ registrationNumber: event.target.value })} error={errorFor('vehicle.registrationNumber')} />
      <TextField name="vehicle.make" label="Make" required placeholder="Hyundai" value={draft.vehicle.make ?? ''} onChange={event => setVehicle({ make: event.target.value })} error={errorFor('vehicle.make')} />
      <TextField name="vehicle.model" label="Model" required placeholder="i10" value={draft.vehicle.model ?? ''} onChange={event => setVehicle({ model: event.target.value })} error={errorFor('vehicle.model')} />
      <TextField name="vehicle.variant" label="Variant" value={draft.vehicle.variant ?? ''} onChange={event => setVehicle({ variant: event.target.value })} error={errorFor('vehicle.variant')} />
      <TextField name="vehicle.manufacturingYear" label="Manufacturing year" required inputMode="numeric" placeholder="2010" value={draft.vehicle.manufacturingYear?.toString() ?? ''} onChange={event => setVehicle({ manufacturingYear: toNumber(event.target.value, 4) })} error={errorFor('vehicle.manufacturingYear')} />
      <TextField name="vehicle.registrationYear" label="Registration year" inputMode="numeric" hint="Optional" value={draft.vehicle.registrationYear?.toString() ?? ''} onChange={event => setVehicle({ registrationYear: toNumber(event.target.value, 4) })} error={errorFor('vehicle.registrationYear')} />
      <ChoiceGroup name="vehicle.vehicleCategory" label="Vehicle type" required layout="wrap" options={definition.vehicleCategories} value={draft.vehicle.vehicleCategory} onChange={value => setVehicle({ vehicleCategory: value })} error={errorFor('vehicle.vehicleCategory')} />
      <ChoiceGroup name="vehicle.fuelType" label="Fuel" required layout="wrap" options={definition.fuelTypes.map(value => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))} value={draft.vehicle.fuelType} onChange={value => setVehicle({ fuelType: value })} error={errorFor('vehicle.fuelType')} />
      <TextField name="vehicle.odometerKm" label="Odometer (km)" required inputMode="numeric" value={draft.vehicle.odometerKm?.toString() ?? ''} onChange={event => setVehicle({ odometerKm: toNumber(event.target.value) })} error={errorFor('vehicle.odometerKm')} />
    </Section>
  );

  return (
    <PageShell title="Scrap a car" subtitle={`Step ${stepIndex + 1} of ${STEPS.length} · ${step.title}`} back={{ to: { name: 'home' }, label: 'Scrapping home' }}>
      <div ref={root} className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 ref={heading} tabIndex={-1} className="text-lg font-bold outline-none">{step.title}</h2>
            <p className="text-sm text-base-content/70">{step.subtitle}</p>
          </div>
          <SaveIndicator state={saveState} onRetry={() => void syncRef.current?.save()} />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-200" role="progressbar" aria-label="Form progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1}>
          <div className="h-full bg-primary transition-[width]" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
        </div>

        {notice ? <Notice tone="warning" action={{ label: 'Dismiss', onClick: () => setNotice('') }}>{notice}</Notice> : null}

        <form noValidate onSubmit={event => { event.preventDefault(); void (step.id === 'REVIEW' ? submit() : goNext()); }} className="grid gap-4">
          {step.id === 'VEHICLE' ? vehicleFields : null}

          {step.id === 'CONDITION' || step.id === 'DAMAGE' ? (
            <>
              {step.id === 'DAMAGE' && electric ? <Notice tone="warning">This is an electric vehicle. Please do not open, touch or move the battery pack. Just tell us what you can see from outside.</Notice> : null}
              <Section>{questionsFor(step.id).length ? questionsFor(step.id).map(questionField) : <p className="text-sm text-base-content/70">No questions on this step.</p>}</Section>
            </>
          ) : null}

          {step.id === 'PHOTOS' ? (
            <Section title="Photos and documents">
              <p className="text-sm leading-relaxed">After we review your request we will tell you exactly which photographs and documents we need, and why. You do not need to prepare anything now.</p>
              <Notice tone="info">Adding photos and documents on the website is coming in an update. Until then our team will contact you if anything is needed.</Notice>
            </Section>
          ) : null}

          {step.id === 'OWNERSHIP' ? (
            <>
              <Notice tone="info">This is your own declaration. We may ask for proof of ownership later. Answering "no" or "yes" to any question here does not reject your request; our team will look at it with you.</Notice>
              <Section>
                <YesNo name="ownership.isRegisteredOwner" label="Are you the registered owner of this vehicle?" required value={draft.ownership.isRegisteredOwner} onChange={value => setOwnership({ isRegisteredOwner: value })} error={errorFor('ownership.isRegisteredOwner')} />
                {draft.ownership.isRegisteredOwner === false ? <TextareaField name="ownership.ownerRelationship" label="How are you connected to the owner?" required value={draft.ownership.ownerRelationship ?? ''} onChange={event => setOwnership({ ownerRelationship: event.target.value })} error={errorFor('ownership.ownerRelationship')} /> : null}
                <YesNo name="ownership.hasLoan" label="Is there a loan or hypothecation on the vehicle?" required value={draft.ownership.hasLoan} onChange={value => setOwnership({ hasLoan: value })} error={errorFor('ownership.hasLoan')} />
                {draft.ownership.hasLoan === true ? <TextField name="ownership.lenderName" label="Who is the lender?" required value={draft.ownership.lenderName ?? ''} onChange={event => setOwnership({ lenderName: event.target.value })} error={errorFor('ownership.lenderName')} /> : null}
                <YesNo name="ownership.hasPendingDues" label="Are there any pending dues (for example fines or taxes)?" required value={draft.ownership.hasPendingDues} onChange={value => setOwnership({ hasPendingDues: value })} error={errorFor('ownership.hasPendingDues')} />
                {draft.ownership.hasPendingDues === true ? <TextareaField name="ownership.duesDetails" label="What is pending?" required value={draft.ownership.duesDetails ?? ''} onChange={event => setOwnership({ duesDetails: event.target.value })} error={errorFor('ownership.duesDetails')} /> : null}
                <YesNo name="ownership.hasLegalDispute" label="Is there any legal dispute about this vehicle?" required value={draft.ownership.hasLegalDispute} onChange={value => setOwnership({ hasLegalDispute: value })} error={errorFor('ownership.hasLegalDispute')} />
                {draft.ownership.hasLegalDispute === true ? <TextareaField name="ownership.disputeDetails" label="Tell us about it" required value={draft.ownership.disputeDetails ?? ''} onChange={event => setOwnership({ disputeDetails: event.target.value })} error={errorFor('ownership.disputeDetails')} /> : null}
              </Section>
              <CheckboxField name="ownership.declarationAccepted" checked={draft.ownership.declarationAccepted === true} onChange={value => setOwnership({ declarationAccepted: value })} error={errorFor('ownership.declarationAccepted')}>
                I declare that what I have told V MOTIV about this vehicle is true. I understand V MOTIV arranges scrapping with an authorised facility and may ask me for proof of ownership.
              </CheckboxField>
            </>
          ) : null}

          {step.id === 'PICKUP' ? (
            <Section title="Where is the vehicle?">
              <TextField name="pickupAddress.line1" label="Address" required autoComplete="address-line1" value={draft.pickupAddress.line1 ?? ''} onChange={event => setPickup({ line1: event.target.value })} error={errorFor('pickupAddress.line1')} />
              <TextField name="pickupAddress.line2" label="Area or street" autoComplete="address-line2" value={draft.pickupAddress.line2 ?? ''} onChange={event => setPickup({ line2: event.target.value })} error={errorFor('pickupAddress.line2')} />
              <TextField name="pickupAddress.landmark" label="Landmark" hint="Optional. Helps the driver find you." value={draft.pickupAddress.landmark ?? ''} onChange={event => setPickup({ landmark: event.target.value })} error={errorFor('pickupAddress.landmark')} />
              <TextField name="pickupAddress.city" label="City" required autoComplete="address-level2" value={draft.pickupAddress.city ?? ''} onChange={event => setPickup({ city: event.target.value })} error={errorFor('pickupAddress.city')} />
              <TextField name="pickupAddress.pincode" label="Pincode" required inputMode="numeric" autoComplete="postal-code" value={draft.pickupAddress.pincode ?? ''} onChange={event => setPickup({ pincode: digits(event.target.value).slice(0, 6) })} error={errorFor('pickupAddress.pincode')} />
            </Section>
          ) : null}

          {step.id === 'REVIEW' ? (
            <>
              <Notice tone="info">After you submit, you will see an estimate if we have approved pricing for your vehicle, or "quotation required" if we need to ask an authorised facility. Neither is an offer.</Notice>
              <Section title="Vehicle">
                <p className="font-bold">{[draft.vehicle.manufacturingYear, draft.vehicle.make, draft.vehicle.model, draft.vehicle.variant].filter(Boolean).join(' ')}</p>
                <p className="text-sm text-base-content/75">{draft.vehicle.registrationNumber} · {draft.vehicle.odometerKm?.toLocaleString('en-IN')} km · {draft.vehicle.fuelType?.toLowerCase()}</p>
                <div><Button type="button" variant="link" size="sm" onClick={() => jumpTo('VEHICLE')}>Change vehicle details</Button></div>
              </Section>
              <Section title="Condition and damage">
                <dl className="grid gap-2">
                  {summary.map(question => (draft.answers[question.key] === undefined ? null : (
                    <div key={question.key}><dt className="text-xs text-base-content/60">{question.label}</dt><dd className="text-sm font-medium">{labelOf(question, draft.answers[question.key])}</dd></div>
                  )))}
                </dl>
                <div><Button type="button" variant="link" size="sm" onClick={() => jumpTo('CONDITION')}>Change condition answers</Button></div>
              </Section>
              <Section title="Ownership">
                <p className="text-sm text-base-content/75">{draft.ownership.isRegisteredOwner ? 'Registered owner' : 'Not the registered owner'} · {draft.ownership.hasLoan ? 'Loan declared' : 'No loan'} · {draft.ownership.hasPendingDues ? 'Dues pending' : 'No dues'} · {draft.ownership.hasLegalDispute ? 'Dispute declared' : 'No dispute'}</p>
                <div><Button type="button" variant="link" size="sm" onClick={() => jumpTo('OWNERSHIP')}>Change ownership answers</Button></div>
              </Section>
              <Section title="Pickup">
                <p className="text-sm text-base-content/75">{[draft.pickupAddress.line1, draft.pickupAddress.line2, draft.pickupAddress.city, draft.pickupAddress.pincode].filter(Boolean).join(', ')}</p>
                <div><Button type="button" variant="link" size="sm" onClick={() => jumpTo('PICKUP')}>Change pickup address</Button></div>
              </Section>
              {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
            </>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {step.id === 'REVIEW'
              ? <Button type="submit" loading={submitting}>Submit request</Button>
              : <Button type="submit" loading={creating}>Continue</Button>}
            <Button type="button" variant="outline" onClick={goBack}>{stepIndex > 0 ? 'Back' : 'Cancel'}</Button>
            {syncRef.current?.attached ? <Button type="button" variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}>Delete this draft</Button> : null}
          </div>
        </form>
      </div>

      {confirmDelete ? <ConfirmDialog title="Delete this draft?" message="Your answers will be removed. This cannot be undone." confirmLabel="Delete draft" cancelLabel="Keep it" tone="danger" onConfirm={discard} onCancel={() => setConfirmDelete(false)} /> : null}
    </PageShell>
  );
}
