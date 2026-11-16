import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, CheckCircle2, Phone } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../theme';
import { CustomerButton } from '../components/customer-ui';
import { FormField, FormFooter, KeyboardAwareFormScreen } from '../components/KeyboardAwareFormScreen';
import { fetchCustomerVehicles } from '../services/service-api';
import {
  FUEL_TYPES, digitsOnly, emptyForm, newSubmissionKey, serverFieldErrors, submitErrorMessage, tenDigitMobile, toPayload, validateForm,
  type FormErrors, type ScrapFormValues,
} from '../services/scrap-request';
import { sendScrapRequest, type ScrapRequestResult } from '../services/scrap-request-api';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'ScrapRequest'>;

/**
 * Scrap a car, kept deliberately simple: tell us about the vehicle and where it is, and our team will phone you. What happens after that
 * (inspection, price, paperwork, collection) is arranged with you on the call. This screen shows no price and promises no outcome.
 */
export function ScrapRequestScreen({ navigation, route }: Props) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const { state, profile } = useAuth();

  const [values, setValues] = useState<ScrapFormValues>(() => emptyForm(tenDigitMobile(profile?.phone)));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ScrapRequestResult['request'] | null>(null);
  const keyRef = useRef(newSubmissionKey()); // one per opened form: a retry returns the same request
  const busyRef = useRef(false); // a second tap while sending does nothing

  const set = <K extends keyof ScrapFormValues>(field: K, value: ScrapFormValues[K]) => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError('');
  };

  // Coming from My Garage: fill in what we already know about that car. Anything can still be changed.
  useEffect(() => {
    const vehicleId = route.params?.vehicleId;
    if (!vehicleId || state !== 'signed-in') return;
    let current = true;
    fetchCustomerVehicles().then(vehicles => {
      const vehicle = vehicles.find(item => item.id === vehicleId);
      if (!vehicle || !current) return;
      setValues(existing => ({
        ...existing,
        registrationNumber: existing.registrationNumber || vehicle.registrationNumber || '',
        make: existing.make || vehicle.make,
        model: existing.model || vehicle.model,
        year: existing.year || String(vehicle.year),
        fuelType: existing.fuelType || FUEL_TYPES.find(item => item.toLowerCase() === (vehicle.fuelType ?? '').toLowerCase()) || '',
        odometerKm: existing.odometerKm || (vehicle.odometerKm ? String(vehicle.odometerKm) : ''),
      }));
    }).catch(() => undefined);
    return () => { current = false; };
  }, [route.params?.vehicleId, state]);

  const submit = async () => {
    if (busyRef.current) return;
    const found = validateForm(values);
    setErrors(found);
    if (Object.keys(found).length) { setFormError('Please fix the highlighted fields.'); return; }
    busyRef.current = true;
    setBusy(true);
    setFormError('');
    try {
      const result = await sendScrapRequest(toPayload(values, keyRef.current));
      setDone(result.request);
    } catch (error) {
      const fields = serverFieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      setFormError(submitErrorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: insets.top + 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.background }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <ArrowLeft size={22} color={c.textPrimary} />
      </Pressable>
      <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: 18, fontWeight: '800' }}>Scrap a car</Text>
    </View>
  );

  if (state !== 'signed-in') {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {header}
        <View style={{ padding: 20, gap: 16 }}>
          <Text style={{ color: c.textPrimary, fontSize: 20, fontWeight: '800' }}>Sign in to ask us to scrap your car</Text>
          <Text style={{ color: c.textSecondary, lineHeight: 22 }}>We use your account so our team knows who to call and you can follow up with us.</Text>
          <CustomerButton title="Sign in" onPress={() => navigation.navigate('Tabs', { screen: 'Account' })} />
        </View>
      </View>
    );
  }

  if (done) {
    const phone = `+91 ${tenDigitMobile(values.phone)}`;
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        {header}
        <View style={{ padding: 20, gap: 16 }}>
          <View style={{ alignItems: 'center', gap: 10, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
            <CheckCircle2 size={44} color={c.success} accessibilityElementsHidden />
            <Text accessibilityRole="header" style={{ color: c.textPrimary, fontSize: 21, fontWeight: '800', textAlign: 'center' }}>We have your request</Text>
            <Text style={{ color: c.textSecondary, textAlign: 'center', lineHeight: 22 }}>Our team will call you on {phone} to take it forward. Keep your registration certificate (RC) handy.</Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>Reference {done.requestNumber}</Text>
          </View>
          <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>
            V MOTIV arranges scrapping with an authorised scrapping facility. We are not the facility and not a government service. Nothing is decided until you have spoken to our team.
          </Text>
          <CustomerButton title="Done" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareFormScreen
      header={header}
      footer={<FormFooter primaryTitle="Send request" onPrimaryPress={() => void submit()} primaryBusy={busy} />}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
        <Phone size={18} color={c.brandAccent} accessibilityElementsHidden />
        <Text style={{ flex: 1, color: c.textSecondary, lineHeight: 21 }}>Tell us about your vehicle. Our team will phone you to take it from there. You do not need to send any documents now.</Text>
      </View>

      {formError ? <Text accessibilityRole="alert" style={{ color: c.error, fontWeight: '700' }}>{formError}</Text> : null}

      <FormField label="Registration number" required autoCapitalize="characters" autoCorrect={false} placeholder="KA01AB1234" value={values.registrationNumber} onChangeText={text => set('registrationNumber', text)} error={errors.registrationNumber} />
      <FormField label="Make" required placeholder="Hyundai" value={values.make} onChangeText={text => set('make', text)} error={errors.make} />
      <FormField label="Model" required placeholder="i10" value={values.model} onChangeText={text => set('model', text)} error={errors.model} />
      <FormField label="Year made" required keyboardType="number-pad" placeholder="2008" value={values.year} onChangeText={text => set('year', digitsOnly(text, 4))} error={errors.year} />

      <View style={{ gap: 6 }}>
        <Text style={{ color: c.textPrimary, fontWeight: '700' }}>Fuel <Text style={{ color: c.textMuted, fontWeight: '400' }}>(optional)</Text></Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FUEL_TYPES.map(fuel => {
            const selected = values.fuelType === fuel;
            return (
              <Pressable
                key={fuel}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={fuel}
                onPress={() => set('fuelType', selected ? '' : fuel)}
                style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: selected ? c.brandAccent : c.border, backgroundColor: selected ? c.selected : c.surface, justifyContent: 'center' }}
              >
                <Text style={{ color: c.textPrimary, fontWeight: selected ? '800' : '500' }}>{fuel}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField label="Kilometres driven" keyboardType="number-pad" helperText="Optional. An estimate is fine." value={values.odometerKm} onChangeText={text => set('odometerKm', digitsOnly(text, 7))} error={errors.odometerKm} />
      <FormField label="Anything we should know" multiline helperText="Optional. For example: not starting, accident damage, missing parts, loan on the car." value={values.condition} onChangeText={text => set('condition', text)} maxLength={1000} error={errors.condition} />
      <FormField label="City" required textContentType="addressCity" value={values.city} onChangeText={text => set('city', text)} error={errors.city} />
      <FormField label="Where is the vehicle?" helperText="Optional. Area or address, so we can plan the pickup." value={values.pickupAddress} onChangeText={text => set('pickupAddress', text)} error={errors.pickupAddress} />
      <FormField label="Mobile number to call" required keyboardType="phone-pad" textContentType="telephoneNumber" helperText="Our team will call you on this number." value={values.phone} onChangeText={text => set('phone', digitsOnly(text, 12))} error={errors.phone} />

      <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 18 }}>
        V MOTIV arranges scrapping with an authorised scrapping facility. We are not the facility and not a government service. We do not promise a price until you have spoken to our team.
      </Text>
    </KeyboardAwareFormScreen>
  );
}
