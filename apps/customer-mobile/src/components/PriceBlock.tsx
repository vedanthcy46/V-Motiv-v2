import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatPrice } from '../format';
import { useAppTheme } from '../theme';

/**
 * The car's price. When it has been lowered since it was first listed, shows the drop like a shopping app:
 * "-2%  ₹5,40,000" with the earlier price struck through underneath.
 */
export function PriceBlock({ pricePaise, originalPricePaise, discountPercent, size = 'card', align = 'right' }: {
  pricePaise: string;
  originalPricePaise?: string | null;
  discountPercent?: number | null;
  size?: 'card' | 'detail';
  align?: 'left' | 'right';
}) {
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;
  const big = size === 'detail';
  const hasDrop = Boolean(originalPricePaise && discountPercent && discountPercent > 0);
  const priceColor = size === 'detail' ? c.brandAccent : isDark ? c.brandAccent : c.brandNavy;
  const edge = align === 'right' ? 'flex-end' : 'flex-start';

  return (
    <View style={{ alignItems: edge }} accessible accessibilityLabel={hasDrop ? `${formatPrice(pricePaise)}, down ${discountPercent} percent from ${formatPrice(originalPricePaise!)}` : formatPrice(pricePaise)}>
      <View style={styles.row}>
        {hasDrop ? <Text style={[styles.drop, { color: c.error, fontSize: big ? 18 : 13 }]}>-{discountPercent}%</Text> : null}
        <Text style={[styles.price, { color: priceColor, fontSize: big ? 26 : 18 }]}>{formatPrice(pricePaise)}</Text>
      </View>
      {hasDrop ? (
        <Text style={[styles.was, { color: c.textMuted, fontSize: big ? 13 : 11.5 }]}>
          Was <Text style={styles.struck}>{formatPrice(originalPricePaise!)}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontWeight: '900', letterSpacing: -0.3 },
  drop: { fontWeight: '600' },
  was: { fontWeight: '500', marginTop: 1 },
  struck: { textDecorationLine: 'line-through' },
});
