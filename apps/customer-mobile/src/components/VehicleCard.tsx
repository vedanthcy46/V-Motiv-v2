import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bookmark, Calendar, CheckCircle2, Fuel, Gauge, MapPin } from 'lucide-react-native';
import { formatPrice } from '../format';
import { color, radius, space } from '../theme';
import type { VehicleSummary } from '../types';

export function VehicleCard({
  vehicle: listing,
  onOpen,
  onSave,
  onBook,
}: {
  vehicle: VehicleSummary;
  onOpen: () => void;
  onSave: () => void;
  onBook: () => void;
}) {
  const vehicle = listing.vehicle;
  const image = listing.media[0]?.url;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${listing.title}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.imageWrap}>
        {image ? (
          <Image
            accessibilityLabel={`${listing.title} exterior`}
            source={{ uri: image }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.noImage}>
            <Text style={styles.noImageText}>Photos in inspection</Text>
          </View>
        )}

        {/* Verified Badge */}
        <View style={styles.badge}>
          <CheckCircle2 size={12} color={color.yellow} />
          <Text style={styles.badgeText}>180-PT VERIFIED</Text>
        </View>

        {/* Wishlist Button with hitSlop */}
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
            color={listing.isWishlisted ? color.yellow : color.white}
            fill={listing.isWishlisted ? color.yellow : 'transparent'}
          />
        </Pressable>

        {/* City Overlay */}
        <View style={styles.cityPill}>
          <MapPin size={11} color={color.white} />
          <Text style={styles.cityPillText}>{vehicle.city || 'V MOTIV HUB'}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {vehicle.make} {vehicle.model}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {vehicle.manufacturingYear} · {vehicle.variant || 'Standard'}
            </Text>
          </View>
          <Text style={styles.price}>{formatPrice(listing.pricePaise)}</Text>
        </View>

        {/* Key Specs Chips with Icons */}
        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <Gauge size={12} color={color.muted} />
            <Text style={styles.chipText}>{vehicle.odometerKm.toLocaleString('en-IN')} km</Text>
          </View>
          <View style={styles.chip}>
            <Fuel size={12} color={color.muted} />
            <Text style={styles.chipText}>{vehicle.fuelType}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{vehicle.transmission}</Text>
          </View>
        </View>

        {/* Action Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Book a test drive for ${listing.title}`}
          onPress={(event) => {
            event.stopPropagation();
            onBook();
          }}
          style={({ pressed }) => [styles.bookBtn, pressed && styles.bookBtnPressed]}
        >
          <Calendar size={15} color={color.navy} />
          <Text style={styles.bookBtnText}>Book Test Drive</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  imageWrap: {
    height: 190,
    backgroundColor: color.navy,
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
    backgroundColor: '#092144',
  },
  noImageText: {
    color: color.muted,
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
    color: color.yellow,
    fontSize: 10.5,
    fontWeight: '800',
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
    color: color.textSecondary,
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
    color: color.text,
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: color.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  price: {
    color: color.yellow,
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
    backgroundColor: color.input,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  chipText: {
    color: color.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  bookBtn: {
    minHeight: 44,
    backgroundColor: color.yellow,
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
  bookBtnText: {
    color: color.navy,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
