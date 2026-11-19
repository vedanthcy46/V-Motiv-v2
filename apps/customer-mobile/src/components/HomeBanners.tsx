import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../theme';
import { Carousel } from './Carousel';
import { CaptionScrim } from './CaptionScrim';
import type { HomeItem } from '../services/home-content';

const PAGE_PADDING = 20; // the Home screen's side padding: the banners cancel it so they run edge to edge
const AUTO_MS = 5000;

/**
 * Promotional banners managed by the Operations team, shown edge to edge at 2:1 like the app's other main banners. With more than one they
 * move on by themselves every few seconds and can be swiped by hand, with dots showing the position. A banner is a button when it has
 * somewhere to go. A banner whose picture will not load shows a plain brand tile with its text instead of a blank gap.
 */
export function HomeBanners({ items, onOpen }: { items: HomeItem[]; onOpen: (item: HomeItem) => void }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const height = Math.round(width / 2);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  if (items.length === 0) return null;

  return (
    <View accessibilityLabel={`Promotions, ${items.length} ${items.length === 1 ? 'banner' : 'banners'}`} style={{ marginHorizontal: -PAGE_PADDING }}>
      <Carousel
        data={items}
        keyOf={item => item.id}
        itemWidth={width}
        autoAdvanceMs={AUTO_MS}
        dots="overlay"
        renderItem={item => {
          const hasAction = item.actionType !== 'NONE';
          const showImage = !broken[item.id];
          const showCaption = Boolean(item.title || item.subtitle || (hasAction && item.ctaLabel));
          const label = [item.title, item.subtitle, hasAction ? item.ctaLabel : null].filter(Boolean).join('. ') || 'Promotional banner';
          const body = (
            <View style={[styles.card, { width, height, backgroundColor: c.brandNavy }]}>
              {showImage ? (
                <Image source={{ uri: item.mediaUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} onError={() => setBroken(current => ({ ...current, [item.id]: true }))} accessibilityIgnoresInvertColors />
              ) : null}
              {showCaption ? (
                <>
                  {/* A soft fade (stacked strips of rising opacity) so the words are readable without a heavy box over the picture. */}
                  {showImage ? <CaptionScrim height={Math.round(height * 0.46)} /> : null}
                  <View style={[styles.captionRow, { paddingBottom: items.length > 1 ? 26 : 12 }]}>
                    <View style={styles.captionText}>
                      {item.title ? <Text numberOfLines={1} style={styles.title}>{item.title}</Text> : null}
                      {item.subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{item.subtitle}</Text> : null}
                    </View>
                    {hasAction && item.ctaLabel ? (
                      <View style={[styles.cta, { backgroundColor: c.brandAccent }]}><Text numberOfLines={1} style={[styles.ctaText, { color: c.brandNavy }]}>{item.ctaLabel}</Text></View>
                    ) : null}
                  </View>
                </>
              ) : null}
            </View>
          );
          return hasAction ? (
            <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onOpen(item)} style={({ pressed }) => pressed && { opacity: 0.92 }}>{body}</Pressable>
          ) : (
            <View accessible accessibilityRole="image" accessibilityLabel={label}>{body}</View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', justifyContent: 'flex-end' },
  captionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: PAGE_PADDING, paddingTop: 8 },
  captionText: { flex: 1, gap: 1 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#E2E8F0', fontSize: 13, lineHeight: 17 },
  cta: { flexShrink: 0, maxWidth: '42%', minHeight: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: 'center' },
  ctaText: { fontSize: 12.5, fontWeight: '800' },
});
