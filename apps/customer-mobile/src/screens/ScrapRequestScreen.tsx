import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Trash2 } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme';
import { FormField, FormFooter, KeyboardAwareFormScreen } from '../components/KeyboardAwareFormScreen';
import { Card, Checkbox, ChoiceList, Chips, Notice, SaveIndicator, ScreenHeader, YesNo, type SaveState } from '../components/scrap/ScrapUi';
import { CustomerButton } from '../components/customer-ui';
import { fetchCustomerVehicles, type CustomerVehicle } from '../services/service-api';
import { scrapApi, isDraftView } from '../services/scrap-api';
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from '../services/scrap-draft-store';
import {
  STEPS, STEP_SECTIONS, applyDraftPatch, diffDraft, draftFromServer, emptyDraft, fieldErrorsFrom, fieldsOfPatch, firstIncompleteStep, isElectric, isRetryable,
  newSubmissionKey, patchWithout, pruneAnswers, scrapErrorMessage, stepForField, stepProblems, valueAt, visibleQuestions,
  type DraftPatch, type DraftState, type QuestionDef, type QuestionnaireDefinition, type StepId,
} from '../services/scrap-form';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'ScrapRequest'>;

const SAVE_DELAY_MS = 800;

const digits = (text: string) => text.replace(/\D/g, '');
const toNumber = (text: string): number | undefined => { const clean = digits(text); return clean ? Number(clean) : undefined; };

export function ScrapRequestScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const { profile } = useAuth();
  const userId = profile?.id;

  const [definition, setDefinition] = useState<QuestionnaireDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraftState] = useState<DraftState>(emptyDraft());
  const [stepIndex, setStepIndex] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrorsState] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState<Partial<Record<StepId, boolean>>>({});
  const [garage, setGarage] = useState<CustomerVehicle[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [creating, setCreating] = useState(false);

  // What the screen holds (draft), what the server last confirmed (saved), and which request it is. Refs, because the saving code runs
  // asynchronously and must always see the latest values rather than the ones from the render that started it.
  const draftRef = useRef<DraftState>(emptyDraft());
  const savedRef = useRef<DraftState>(emptyDraft());
  const versionRef = useRef(0);
  const idRef = useRef<string | null>(route.params?.requestId ?? null);
  const garageVehicleRef = useRef<string | undefined>(route.params?.vehicleId);
  const keyRef = useRef(newSubmissionKey());
  const refusedRef = useRef<Map<string, string>>(new Map()); // field -> the value the server refused, so it is not re-sent until it changes
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const fieldErrorsRef = useRef<Record<string, string>>({});

  const setFieldErrors = useCallback((next: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => {
    const value = typeof next === 'function' ? next(fieldErrorsRef.current) : next;
    fieldErrorsRef.current = value;
    if (mountedRef.current) setFieldErrorsState(value);
  }, []);

  const step = STEPS[stepIndex]!;

  // ------------------------------------------------------------------------------------------------------------------------------
  // Saving
  // ------------------------------------------------------------------------------------------------------------------------------------

  /** Reads the server's copy and adopts it, used after another device changed the draft. */
  const adoptServer = useCallback(async () => {
    if (!idRef.current) return;
    const view = await scrapApi.get(idRef.current);
    if (!isDraftView(view)) { navigation.replace('ScrapRequestDetails', { requestId: view.id }); return; }
    const server = draftFromServer(view.draft);
    savedRef.current = server;
    versionRef.current = view.version;
    draftRef.current = server;
    refusedRef.current.clear();
    if (mountedRef.current) setDraftState(server);
    setFieldErrors({});
  }, [navigation]);

  /** Sends what changed. Returns true when the server holds everything the person has entered (except fields it refused, which are shown). */
  const runSave = useCallback(async (): Promise<boolean> => {
    if (!idRef.current) return true;
    for (let round = 0; round < 6; round += 1) {
      const full = diffDraft(savedRef.current, draftRef.current);
      if (!full) { if (mountedRef.current) setSaveState(state => (state === 'saving' ? 'saved' : state)); return true; }
      // Leave out any field whose current value is the one the server already refused.
      const stillRefused = [...refusedRef.current.entries()].filter(([field, value]) => JSON.stringify(valueAt(draftRef.current, field) ?? null) === value).map(([field]) => field);
      const patch = patchWithout(full, stillRefused);
      // Nothing left to send except fields the server refused: everything else is saved, and those are shown to be fixed.
      if (!patch) { if (mountedRef.current) setSaveState('saved'); return Object.keys(fieldErrorsRef.current).length === 0; }
      if (mountedRef.current) setSaveState('saving');
      try {
        const view = await scrapApi.saveDraft(idRef.current, versionRef.current, patch);
        versionRef.current = view.version;
        savedRef.current = applyDraftPatch(savedRef.current, patch);
        const sentFields = fieldsOfPatch(patch);
        for (const field of sentFields) refusedRef.current.delete(field);
        setFieldErrors(errors => Object.fromEntries(Object.entries(errors).filter(([field]) => !sentFields.includes(field))));
      } catch (error) {
        const e = error as { status?: number; code?: string };
        if (e.status === 409 && e.code === 'SCRAP_VERSION_CONFLICT') {
          await adoptServer().catch(() => undefined);
          if (mountedRef.current) { setNotice('This request was changed on another device. We loaded the latest version.'); setSaveState('saved'); }
          return false;
        }
        const fields = fieldErrorsFrom(error);
        if (e.status === 400 && Object.keys(fields).length) {
          for (const field of Object.keys(fields)) refusedRef.current.set(field, JSON.stringify(valueAt(draftRef.current, field) ?? null));
          setFieldErrors(errors => ({ ...errors, ...fields }));
          continue; // save the rest without the refused fields
        }
        if (mountedRef.current) setSaveState(isRetryable(error) ? 'offline' : 'error');
        return false;
      }
    }
    return true;
  }, [adoptServer, setFieldErrors]);

  /** One save at a time; a request made while one is running waits for it and then sends what is left. */
  const save = useCallback((): Promise<boolean> => {
    const previous = savingRef.current ?? Promise.resolve(true);
    const next = previous.then(() => runSave()).finally(() => { if (savingRef.current === next) savingRef.current = null; });
    savingRef.current = next;
    return next;
  }, [runSave]);

  const scheduleSave = useCallback(() => {
    if (!idRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void save(); }, SAVE_DELAY_MS);
  }, [save]);

  /** Every change goes through here: update the screen, keep a copy on the phone, and schedule the save. */
  const change = useCallback((mutate: (current: DraftState) => DraftState) => {
    let next = mutate(draftRef.current);
    if (definition) next = { ...next, answers: pruneAnswers(definition, next.answers, next.vehicle) };
    draftRef.current = next;
    setDraftState(next);
    setSubmitError('');
    void writeLocalDraft(userId, idRef.current, next);
    scheduleSave();
  }, [definition, scheduleSave, userId]);

  const setVehicle = (patch: Partial<DraftState['vehicle']>) => change(current => ({ ...current, vehicle: { ...current.vehicle, ...patch } }));
  const setAnswer = (key: string, value: string | boolean) => change(current => ({ ...current, answers: { ...current.answers, [key]: value } }));
  const setOwnership = (patch: Partial<DraftState['ownership']>) => change(current => ({ ...current, ownership: { ...current.ownership, ...patch } }));
  const setPickup = (patch: Partial<DraftState['pickupAddress']>) => change(current => ({ ...current, pickupAddress: { ...current.pickupAddress, ...patch } }));

  // ------------------------------------------------------------------------------------------------------------------------------
  // Loading, resuming
  // ------------------------------------------------------------------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [questions, vehicles] = await Promise.all([scrapApi.questionnaire(), fetchCustomerVehicles().catch(() => [] as CustomerVehicle[])]);
      setDefinition(questions);
      setGarage(vehicles.filter(vehicle => !vehicle.isArchived));

      let server: DraftState | null = null;
      if (idRef.current) {
        const view = await scrapApi.get(idRef.current);
        if (!isDraftView(view)) { navigation.replace('ScrapRequestDetails', { requestId: view.id }); return; }
        server = draftFromServer(view.draft);
        savedRef.current = server;
        versionRef.current = view.version;
        garageVehicleRef.current = view.customerVehicleId ?? undefined;
      }
      // Anything typed on this phone that never reached the server is kept: closing the app or losing signal must not lose answers.
      const local = await readLocalDraft(userId, idRef.current);
      const start = local && (!server || diffDraft(server, local)) ? local : server ?? emptyDraft();
      draftRef.current = start;
      setDraftState(start);
      const first = firstIncompleteStep(start, questions);
      setStepIndex(first ? STEPS.findIndex(item => item.id === first) : STEPS.length - 1);
      if (local && server && diffDraft(server, local)) { setNotice('We restored answers that had not been saved yet.'); scheduleSave(); }
    } catch (error) {
      setLoadError(scrapErrorMessage(error, 'We could not open this request.'));
    } finally {
      setLoading(false);
    }
  }, [navigation, scheduleSave, userId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      void save(); // leaving the screen: send what has not gone yet
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back moves to the previous step and keeps every answer; from the first step it simply leaves (the draft is saved).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stepIndex > 0) { setStepIndex(index => index - 1); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [stepIndex]);

  /** Creates the draft the first time the person moves on from the vehicle step. Safe to retry: the key returns the same draft. */
  const ensureCreated = async (): Promise<boolean> => {
    if (idRef.current) return true;
    setCreating(true);
    try {
      const patch = diffDraft(emptyDraft(), draftRef.current) ?? {};
      const { request } = await scrapApi.createDraft({ customerVehicleId: garageVehicleRef.current, submissionKey: keyRef.current, draft: patch as DraftPatch });
      idRef.current = request.id;
      versionRef.current = request.version;
      savedRef.current = draftFromServer(request.draft);
      await writeLocalDraft(userId, request.id, draftRef.current);
      await clearLocalDraft(userId, null);
      void save();
      return true;
    } catch (error) {
      const fields = fieldErrorsFrom(error);
      if (Object.keys(fields).length) { setFieldErrors(fields); setAttempted(current => ({ ...current, VEHICLE: true })); }
      else setNotice(scrapErrorMessage(error, 'We could not save your request.'));
      return false;
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  };

  // ------------------------------------------------------------------------------------------------------------------------------
  // Moving between steps, submitting
  // ------------------------------------------------------------------------------------------------------------------------------------

  const stepFieldProblems = (id: StepId) => {
    const own = stepProblems(id, draftRef.current, definition);
    const server = Object.keys(fieldErrors).filter(field => stepForField(field, definition) === id).map(field => ({ field, message: fieldErrors[field]! }));
    return { own, server };
  };

  const goNext = async () => {
    setAttempted(current => ({ ...current, [step.id]: true }));
    setNotice('');
    const { own, server } = stepFieldProblems(step.id);
    if (own.length || server.length) return;
    if (step.id === 'VEHICLE' && !(await ensureCreated())) return;
    if (!idRef.current && step.id !== 'VEHICLE') return;
    setStepIndex(index => Math.min(STEPS.length - 1, index + 1));
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(index => index - 1);
    else navigation.goBack();
  };

  const jumpTo = (id: StepId) => setStepIndex(STEPS.findIndex(item => item.id === id));

  const submit = async () => {
    if (submittingRef.current) return; // a second tap while the first is still running does nothing
    const missing = firstIncompleteStep(draftRef.current, definition);
    if (missing) { setAttempted(current => ({ ...current, [missing]: true })); jumpTo(missing); setSubmitError('Some answers are still needed.'); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
      const saved = await save();
      if (!saved && Object.keys(fieldErrorsRef.current).length) {
        const first = Object.keys(fieldErrorsRef.current)[0]!;
        const target = stepForField(first, definition);
        setAttempted(current => ({ ...current, [target]: true }));
        jumpTo(target);
        setSubmitError('Some answers need fixing before you can submit.');
        return;
      }
      if (!saved) { setSubmitError(saveState === 'error' ? 'Your answers could not be saved. Please try again.' : 'We could not reach V MOTIV. Your answers are kept on this phone. Check your connection and try again.'); return; }
      const result = await scrapApi.submit(idRef.current!);
      await clearLocalDraft(userId, idRef.current);
      navigation.replace('ScrapRequestDetails', { requestId: result.request.id, justSubmitted: !result.alreadySubmitted });
    } catch (error) {
      const fields = fieldErrorsFrom(error);
      if (Object.keys(fields).length) {
        setFieldErrors(fields);
        const target = stepForField(Object.keys(fields)[0]!, definition);
        setAttempted(current => ({ ...current, [target]: true }));
        jumpTo(target);
        setSubmitError('Some answers need fixing before you can submit.');
      } else {
        setSubmitError(scrapErrorMessage(error, 'We could not submit your request.'));
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const discard = () => {
    Alert.alert('Delete this draft?', 'Your answers will be removed. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          try { if (idRef.current) await scrapApi.deleteDraft(idRef.current); } catch (error) { Alert.alert('Could not delete', scrapErrorMessage(error)); return; }
          await clearLocalDraft(userId, idRef.current);
          await clearLocalDraft(userId, null);
          mountedRef.current = false;
          navigation.goBack();
        },
      },
    ]);
  };

  // ------------------------------------------------------------------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------------------------------------------------------------------------

  // Problems are shown for a step only after the person has tried to continue from it, so nobody is told off for a field they are still typing.
  const shown = (id: StepId) => Boolean(attempted[id]);
  const errorFor = (field: string): string | undefined => {
    if (!shown(stepForField(field, definition))) return undefined;
    return fieldErrors[field] ?? stepProblems(stepForField(field, definition), draft, definition).find(problem => problem.field === field)?.message;
  };

  const questionField = (question: QuestionDef) => {
    const error = errorFor(`answers.${question.key}`);
    const value = draft.answers[question.key];
    if (question.type === 'boolean') return <YesNo key={question.key} label={question.label} help={question.help} value={typeof value === 'boolean' ? value : undefined} onChange={next => setAnswer(question.key, next)} error={error} required={question.required} />;
    if (question.type === 'choice') return <ChoiceList key={question.key} label={question.label} help={question.help} options={question.options ?? []} value={typeof value === 'string' ? value : undefined} onChange={next => setAnswer(question.key, next)} error={error} required={question.required} />;
    return <FormField key={question.key} label={question.label} helperText={question.help} required={question.required} multiline value={typeof value === 'string' ? value : ''} onChangeText={text => setAnswer(question.key, text)} maxLength={question.maxLength} error={error} />;
  };

  const questionsFor = (id: StepId) => {
    const sections = STEP_SECTIONS[id] ?? [];
    return definition ? visibleQuestions(definition, draft.answers, draft.vehicle).filter(question => sections.includes(question.section)) : [];
  };

  const summary = useMemo(() => (definition ? visibleQuestions(definition, draft.answers, draft.vehicle) : []), [definition, draft.answers, draft.vehicle]);
  const labelOf = (question: QuestionDef, value: unknown) => (question.type === 'boolean' ? (value ? 'Yes' : 'No') : question.type === 'choice' ? question.options?.find(option => option.value === value)?.label ?? String(value) : String(value));

  const header = (
    <ScreenHeader
      title="Scrap a car"
      subtitle={`Step ${stepIndex + 1} of ${STEPS.length} · ${step.title}`}
      onBack={goBack}
      right={idRef.current ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Delete this draft" onPress={discard} hitSlop={8} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={20} color={c.textMuted} />
        </Pressable>
      ) : null}
    />
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="Scrap a car" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={c.brandAccent} accessibilityLabel="Loading" />
          <Text style={{ color: c.textMuted }}>Opening your request…</Text>
        </View>
      </View>
    );
  }
  if (loadError || !definition) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="Scrap a car" onBack={() => navigation.goBack()} />
        <View style={{ padding: 20, gap: 16 }}>
          <Notice tone="danger">{loadError || 'The questions could not be loaded.'}</Notice>
          <CustomerButton title="Try again" onPress={() => void load()} />
        </View>
      </View>
    );
  }

  const electric = isElectric(draft.vehicle);

  return (
    <KeyboardAwareFormScreen
      header={header}
      footer={
        step.id === 'REVIEW' ? (
          <FormFooter primaryTitle="Submit request" onPrimaryPress={() => void submit()} primaryBusy={submitting} secondaryTitle="Back" onSecondaryPress={goBack} />
        ) : (
          <FormFooter primaryTitle="Continue" onPrimaryPress={() => void goNext()} primaryBusy={creating} secondaryTitle={stepIndex > 0 ? 'Back' : undefined} onSecondaryPress={stepIndex > 0 ? goBack : undefined} />
        )
      }
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
        <Text style={{ color: c.textSecondary, fontSize: 13.5, flex: 1 }}>{step.subtitle}</Text>
        <SaveIndicator state={saveState} onRetry={() => void save()} />
      </View>
      {notice ? <Notice tone="warning" action={{ label: 'Dismiss', onPress: () => setNotice('') }}>{notice}</Notice> : null}

      {step.id === 'VEHICLE' ? (
        <>
          {garage.length > 0 ? (
            <Card title="Choose from My Garage">
              {garage.map(vehicle => {
                const selected = garageVehicleRef.current === vehicle.id && !idRef.current;
                return (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                    accessibilityState={{ selected }}
                    disabled={Boolean(idRef.current)}
                    onPress={() => {
                      garageVehicleRef.current = vehicle.id;
                      setVehicle({
                        ...(vehicle.registrationNumber ? { registrationNumber: vehicle.registrationNumber } : {}), make: vehicle.make, model: vehicle.model, ...(vehicle.variant ? { variant: vehicle.variant } : {}),
                        manufacturingYear: vehicle.year, fuelType: (vehicle.fuelType ?? '').toUpperCase(), ...(vehicle.odometerKm !== undefined && vehicle.odometerKm !== null ? { odometerKm: vehicle.odometerKm } : {}),
                      });
                    }}
                    style={{ minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderColor: selected ? c.brandAccent : c.border, backgroundColor: selected ? c.selected : c.surface, padding: 12, justifyContent: 'center', opacity: idRef.current ? 0.5 : 1 }}
                  >
                    <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
                    {vehicle.registrationNumber ? <Text style={{ color: c.textMuted, fontSize: 12.5 }}>{vehicle.registrationNumber}</Text> : null}
                  </Pressable>
                );
              })}
              <Text style={{ color: c.textMuted, fontSize: 12.5 }}>Or enter the details below. You can fix anything we filled in.</Text>
            </Card>
          ) : null}
          <Card title="Vehicle details">
            <FormField label="Registration number" required autoCapitalize="characters" autoCorrect={false} value={draft.vehicle.registrationNumber ?? ''} onChangeText={text => setVehicle({ registrationNumber: text })} error={errorFor('vehicle.registrationNumber')} placeholder="KA01AB1234" />
            <FormField label="Make" required value={draft.vehicle.make ?? ''} onChangeText={text => setVehicle({ make: text })} error={errorFor('vehicle.make')} placeholder="Hyundai" />
            <FormField label="Model" required value={draft.vehicle.model ?? ''} onChangeText={text => setVehicle({ model: text })} error={errorFor('vehicle.model')} placeholder="i10" />
            <FormField label="Variant" value={draft.vehicle.variant ?? ''} onChangeText={text => setVehicle({ variant: text })} error={errorFor('vehicle.variant')} />
            <FormField label="Manufacturing year" required keyboardType="number-pad" maxLength={4} value={draft.vehicle.manufacturingYear?.toString() ?? ''} onChangeText={text => setVehicle({ manufacturingYear: toNumber(text) })} error={errorFor('vehicle.manufacturingYear')} placeholder="2010" />
            <FormField label="Registration year" keyboardType="number-pad" maxLength={4} value={draft.vehicle.registrationYear?.toString() ?? ''} onChangeText={text => setVehicle({ registrationYear: toNumber(text) })} error={errorFor('vehicle.registrationYear')} helperText="Optional" />
            <Chips label="Vehicle type" options={definition.vehicleCategories} value={draft.vehicle.vehicleCategory} onChange={value => setVehicle({ vehicleCategory: value })} error={errorFor('vehicle.vehicleCategory')} />
            <Chips label="Fuel" options={definition.fuelTypes.map(value => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))} value={draft.vehicle.fuelType} onChange={value => setVehicle({ fuelType: value })} error={errorFor('vehicle.fuelType')} />
            <FormField label="Odometer (km)" required keyboardType="number-pad" value={draft.vehicle.odometerKm?.toString() ?? ''} onChangeText={text => setVehicle({ odometerKm: toNumber(text) })} error={errorFor('vehicle.odometerKm')} />
          </Card>
        </>
      ) : null}

      {step.id === 'CONDITION' || step.id === 'DAMAGE' ? (
        <>
          {step.id === 'DAMAGE' && electric ? <Notice tone="warning">This is an electric vehicle. Please do not open, touch or move the battery pack. Just tell us what you can see from outside.</Notice> : null}
          {questionsFor(step.id).map(questionField)}
          {questionsFor(step.id).length === 0 ? <Text style={{ color: c.textMuted }}>No questions on this step.</Text> : null}
        </>
      ) : null}

      {step.id === 'PHOTOS' ? (
        <Card title="Photos and documents">
          <Text style={{ color: c.textSecondary, lineHeight: 21 }}>
            After we review your request we will tell you exactly which photographs and documents we need, and why. You do not need to prepare anything now.
          </Text>
          <Notice tone="info">Adding photos and documents from the app is coming in an update. Until then our team will contact you if anything is needed.</Notice>
        </Card>
      ) : null}

      {step.id === 'OWNERSHIP' ? (
        <>
          <Notice tone="info">This is your own declaration. We may ask for proof of ownership later. Answering "no" or "yes" to any question here does not reject your request; our team will look at it with you.</Notice>
          <Card>
            <YesNo label="Are you the registered owner of this vehicle?" value={draft.ownership.isRegisteredOwner} onChange={value => setOwnership({ isRegisteredOwner: value })} error={errorFor('ownership.isRegisteredOwner')} />
            {draft.ownership.isRegisteredOwner === false ? <FormField label="How are you connected to the owner?" required multiline value={draft.ownership.ownerRelationship ?? ''} onChangeText={text => setOwnership({ ownerRelationship: text })} error={errorFor('ownership.ownerRelationship')} /> : null}
            <YesNo label="Is there a loan or hypothecation on the vehicle?" value={draft.ownership.hasLoan} onChange={value => setOwnership({ hasLoan: value })} error={errorFor('ownership.hasLoan')} />
            {draft.ownership.hasLoan === true ? <FormField label="Who is the lender?" required value={draft.ownership.lenderName ?? ''} onChangeText={text => setOwnership({ lenderName: text })} error={errorFor('ownership.lenderName')} /> : null}
            <YesNo label="Are there any pending dues (for example fines or taxes)?" value={draft.ownership.hasPendingDues} onChange={value => setOwnership({ hasPendingDues: value })} error={errorFor('ownership.hasPendingDues')} />
            {draft.ownership.hasPendingDues === true ? <FormField label="What is pending?" required multiline value={draft.ownership.duesDetails ?? ''} onChangeText={text => setOwnership({ duesDetails: text })} error={errorFor('ownership.duesDetails')} /> : null}
            <YesNo label="Is there any legal dispute about this vehicle?" value={draft.ownership.hasLegalDispute} onChange={value => setOwnership({ hasLegalDispute: value })} error={errorFor('ownership.hasLegalDispute')} />
            {draft.ownership.hasLegalDispute === true ? <FormField label="Tell us about it" required multiline value={draft.ownership.disputeDetails ?? ''} onChangeText={text => setOwnership({ disputeDetails: text })} error={errorFor('ownership.disputeDetails')} /> : null}
          </Card>
          <Checkbox checked={draft.ownership.declarationAccepted === true} onChange={value => setOwnership({ declarationAccepted: value })} error={errorFor('ownership.declarationAccepted')}>
            I declare that what I have told V MOTIV about this vehicle is true. I understand V MOTIV arranges scrapping with an authorised facility and may ask me for proof of ownership.
          </Checkbox>
        </>
      ) : null}

      {step.id === 'PICKUP' ? (
        <Card title="Where is the vehicle?">
          <FormField label="Address" required value={draft.pickupAddress.line1 ?? ''} onChangeText={text => setPickup({ line1: text })} error={errorFor('pickupAddress.line1')} textContentType="streetAddressLine1" />
          <FormField label="Area or street" value={draft.pickupAddress.line2 ?? ''} onChangeText={text => setPickup({ line2: text })} error={errorFor('pickupAddress.line2')} textContentType="streetAddressLine2" />
          <FormField label="Landmark" value={draft.pickupAddress.landmark ?? ''} onChangeText={text => setPickup({ landmark: text })} helperText="Optional. Helps the driver find you." />
          <FormField label="City" required value={draft.pickupAddress.city ?? ''} onChangeText={text => setPickup({ city: text })} error={errorFor('pickupAddress.city')} textContentType="addressCity" />
          <FormField label="Pincode" required keyboardType="number-pad" maxLength={6} value={draft.pickupAddress.pincode ?? ''} onChangeText={text => setPickup({ pincode: digits(text) })} error={errorFor('pickupAddress.pincode')} textContentType="postalCode" />
        </Card>
      ) : null}

      {step.id === 'REVIEW' ? (
        <>
          <Notice tone="info">After you submit, you will see an estimate if we have approved pricing for your vehicle, or "quotation required" if we need to ask an authorised facility. Neither is an offer.</Notice>
          <Card title="Vehicle">
            <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{[draft.vehicle.manufacturingYear, draft.vehicle.make, draft.vehicle.model, draft.vehicle.variant].filter(Boolean).join(' ')}</Text>
            <Text style={{ color: c.textSecondary }}>{draft.vehicle.registrationNumber} · {draft.vehicle.odometerKm?.toLocaleString('en-IN')} km · {draft.vehicle.fuelType?.toLowerCase()}</Text>
            <Pressable accessibilityRole="button" onPress={() => jumpTo('VEHICLE')} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: c.brandAccent, fontWeight: '800' }}>Change</Text></Pressable>
          </Card>
          <Card title="Condition and damage">
            {summary.map(question => (draft.answers[question.key] === undefined ? null : (
              <View key={question.key} style={{ gap: 2 }}>
                <Text style={{ color: c.textMuted, fontSize: 12.5 }}>{question.label}</Text>
                <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{labelOf(question, draft.answers[question.key])}</Text>
              </View>
            )))}
            <Pressable accessibilityRole="button" onPress={() => jumpTo('CONDITION')} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: c.brandAccent, fontWeight: '800' }}>Change</Text></Pressable>
          </Card>
          <Card title="Ownership">
            <Text style={{ color: c.textSecondary }}>
              {draft.ownership.isRegisteredOwner ? 'Registered owner' : 'Not the registered owner'} · {draft.ownership.hasLoan ? 'Loan declared' : 'No loan'} · {draft.ownership.hasPendingDues ? 'Dues pending' : 'No dues'} · {draft.ownership.hasLegalDispute ? 'Dispute declared' : 'No dispute'}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => jumpTo('OWNERSHIP')} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: c.brandAccent, fontWeight: '800' }}>Change</Text></Pressable>
          </Card>
          <Card title="Pickup">
            <Text style={{ color: c.textSecondary }}>{[draft.pickupAddress.line1, draft.pickupAddress.line2, draft.pickupAddress.city, draft.pickupAddress.pincode].filter(Boolean).join(', ')}</Text>
            <Pressable accessibilityRole="button" onPress={() => jumpTo('PICKUP')} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: c.brandAccent, fontWeight: '800' }}>Change</Text></Pressable>
          </Card>
          {submitError ? <Notice tone="danger">{submitError}</Notice> : null}
        </>
      ) : null}
    </KeyboardAwareFormScreen>
  );
}
