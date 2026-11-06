import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bookmark, Calendar, CheckCircle2, Fuel, Gauge, MapPin } from 'lucide-react-native';
import { PriceBlock } from './PriceBlock';
import { useAppTheme, radius, space } from '../theme';
import type { VehicleSummary } from '../types';

export function VehicleCard({
  vehicle: listing,
  hasTestDrive = false,
  onOpen,
  onSave,
  onBook,
}: {
  vehicle: VehicleSummary;
  hasTestDrive?: boolean;
  onOpen: () => void;
  onSave: () => void;
  onBook: () => void;
}) {
  const { theme, isDark } = useAppTheme();
  const c = theme.colors;
  const vehicle = listing.vehicle;
  const image = listing.media[0]?.url;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${listing.title}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.imageWrap, { backgroundColor: isDark ? c.surfaceSecondary : c.brandNavy }]}>
        {image ? (
          <Image
            accessibilityLabel={`${listing.title} exterior`}
            source={{ uri: image }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.noImage, { backgroundColor: isDark ? '#092144' : '#E2E8F0' }]}>
            <Text style={[styles.noImageText, { color: c.textMuted }]}>Photos in inspection</Text>
          </View>
        )}

        {/* Verified or Hold Badge */}
        {listing.isHeld ? (
          <View style={[styles.badge, styles.holdBadge]}>
            <Text style={styles.holdBadgeText}>UNDER HOLD</Text>
          </View>
        ) : (
          <View style={styles.badge}>
            <CheckCircle2 size={12} color={c.brandAccent} />
            <Text style={[styles.badgeText, { color: c.brandAccent }]}>200-PT CERTIFIED</Text>
          </View>
        )}

        {/* Wishlist Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listing.isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          accessibilityState={{ selected: listing.isWishlisted }}
          hitSlop={12}
          onPress={(event) => {
            event.stopPropagation();
            onSave();
          }}
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
        >
          <Bookmark
            size={18}
            color={listing.isWishlisted ? c.brandAccent : '#FFFFFF'}
            fill={listing.isWishlisted ? c.brandAccent : 'transparent'}
          />
        </Pressable>

        {/* City Overlay */}
        <View style={styles.cityPill}>
          <MapPin size={11} color="#FFFFFF" />
          <Text style={styles.cityPillText}>{vehicle.city || 'V MOTIV HUB'}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>
              {vehicle.make} {vehicle.model}
            </Text>
            <Text style={[styles.subtitle, { color: c.textMuted }]} numberOfLines={1}>
              {vehicle.manufacturingYear} · {vehicle.variant || 'Standard'}
            </Text>
          </View>
          <PriceBlock pricePaise={listing.pricePaise} originalPricePaise={listing.originalPricePaise} discountPercent={listing.discountPercent} />
        </View>

        {/* Key Specs Chips with Icons */}
        <View style={styles.chipsRow}>
          {vehicle.registrationNumber ? (
            <View style={[styles.chip, styles.plateChip, { borderColor: isDark ? 'rgba(247,181,3,0.45)' : 'rgba(11,37,69,0.3)', backgroundColor: isDark ? 'rgba(247,181,3,0.1)' : 'rgba(11,37,69,0.06)' }]}>
              <Text style={[styles.plateChipText, { color: isDark ? c.brandAccent : c.brandNavy }]}>{vehicle.registrationNumber}</Text>
            </View>
          ) : null}
          <View style={[styles.chip, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Gauge size={12} color={c.textMuted} />
            <Text style={[styles.chipText, { color: c.textSecondary }]}>{vehicle.odometerKm.toLocaleString('en-IN')} km</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Fuel size={12} color={c.textMuted} />
            <Text style={[styles.chipText, { color: c.textSecondary }]}>{vehicle.fuelType}</Text>
          </View>
          <View style={[styles.chip, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
            <Text style={[styles.chipText, { color: c.textSecondary }]}>{vehicle.transmission}</Text>
          </View>
          {vehicle.color ? (
            <View style={[styles.chip, { backgroundColor: c.surfaceSecondary, borderColor: c.border }]}>
              <Text style={[styles.chipText, { color: c.textSecondary }]}>{vehicle.color}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasTestDrive ? `Test drive requested for ${listing.title}. View in Activity.` : `Book a test drive for ${listing.title}`}
          disabled={listing.isHeld}
          onPress={(event) => {
            if (listing.isHeld) return;
            event.stopPropagation();
            onBook();
          }}
          style={({ pressed }) => [
            styles.bookBtn,
            { backgroundColor: listing.isHeld ? 'rgba(255, 124, 134, 0.2)' : c.brandAccent },
            listing.isHeld && { borderWidth: 1, borderColor: '#FF7C86' },
            hasTestDrive && [styles.bookBtnRequested, { borderColor: c.brandAccent, backgroundColor: c.selected }],
            pressed && !listing.isHeld && styles.bookBtnPressed,
          ]}
        >
          {listing.isHeld ? (
            <Text style={[styles.bookBtnText, { color: '#FF7C86', fontWeight: '700' }]}>Currently On Hold</Text>
          ) : hasTestDrive ? (
            <>
              <CheckCircle2 size={16} color={c.brandAccent} />
              <Text style={[styles.bookBtnRequestedText, { color: c.textPrimary }]}>Drive Requested · View Status</Text>
            </>
          ) : (
            <>
              <Calendar size={15} color={c.brandNavy} />
              <Text style={[styles.bookBtnText, { color: c.brandNavy }]}>Book Test Drive</Text>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  imageWrap: {
    height: 190,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: 'rgba(2, 11, 24, 0.82)',
    borderColor: 'rgba(247, 181, 3, 0.5)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  holdBadge: {
    backgroundColor: '#FF7C86',
    borderColor: '#FF7C86',
  },
  holdBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#061A38',
    letterSpacing: 0.6,
  },
  cityPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(6, 26, 56, 0.85)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cityPillText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  saveBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(2, 11, 24, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: {
    backgroundColor: 'rgba(2, 11, 24, 0.95)',
    transform: [{ scale: 0.94 }],
  },
  body: {
    padding: space.lg,
    gap: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  price: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  plateChip: {
    paddingHorizontal: 8,
    borderWidth: 1.5,
  },
  plateChipText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bookBtn: {
    minHeight: 44,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
  bookBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  bookBtnRequested: {
    borderWidth: 1,
  },
  bookBtnRequestedText: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  bookBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
