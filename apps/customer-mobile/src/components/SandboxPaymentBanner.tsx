import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePaymentSandbox } from '../services/payment-config';

/** Makes it unmistakable that no real money moves when the API runs the sandbox gateway. */
export function SandboxPaymentBanner() {
  const sandbox = usePaymentSandbox();
  if (sandbox !== true) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.title}>TEST MODE · Sandbox payments</Text>
      <Text style={styles.body}>No real money is charged. Payments here are simulated for testing only.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  title: { color: '#B45309', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  body: { color: '#92400E', fontSize: 12, marginTop: 2, lineHeight: 17 },
});
