import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme';
import { describePhase, isFinalPhase, paymentCard, usePaymentCard } from '../services/payment-status';

/** Mount once near the app root. Shows the payment card whenever a payment is in progress or has just finished. */
export function PaymentStatusHost() {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const card = usePaymentCard();
  if (!card.visible) return null;

  const { title, message, tone } = describePhase(card.phase, card.amount);
  const final = isFinalPhase(card.phase);
  const color = tone === 'success' ? '#16A34A' : tone === 'error' ? c.error : tone === 'warning' ? '#D97706' : c.brandAccent;
  const symbol = tone === 'success' ? '✓' : tone === 'error' ? '✕' : '…';

  return (
    // The back button / swipe cannot dismiss it while the payment is still being confirmed.
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (final) paymentCard.choose('close'); }}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
            {final ? <Text style={[styles.symbol, { color }]}>{card.phase === 'pending' ? '⏱' : symbol}</Text> : <ActivityIndicator size="large" color={color} />}
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: c.textSecondary }]}>{message}</Text>
          {card.phase === 'failed' && card.detail ? <Text style={[styles.detail, { color: c.textMuted }]}>{card.detail}</Text> : null}
          {card.amount && final && card.phase !== 'confirmed' ? <Text style={[styles.amount, { color: c.textMuted }]}>Amount: {card.amount}</Text> : null}
          {card.orderId ? <Text style={[styles.ref, { color: c.textMuted }]}>Reference: {card.orderId}</Text> : null}

          {final ? (
            <View style={styles.actions}>
              {card.phase === 'pending' ? (
                <Pressable accessibilityRole="button" onPress={() => paymentCard.choose('recheck')} style={[styles.button, { backgroundColor: c.brandAccent }]}>
                  <Text style={[styles.buttonText, { color: '#061A38' }]}>Check again</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => paymentCard.choose('close')}
                style={[styles.button, card.phase === 'pending' ? { borderColor: c.border, borderWidth: 1 } : { backgroundColor: color }]}
              >
                <Text style={[styles.buttonText, { color: card.phase === 'pending' ? c.textPrimary : '#FFFFFF' }]}>{card.phase === 'confirmed' ? 'Done' : 'Close'}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 11, 24, 0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center' },
  badge: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  symbol: { fontSize: 34, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  detail: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  amount: { fontSize: 12, marginTop: 10 },
  ref: { fontSize: 11, marginTop: 4 },
  actions: { width: '100%', gap: 10, marginTop: 20 },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: '800' },
});
