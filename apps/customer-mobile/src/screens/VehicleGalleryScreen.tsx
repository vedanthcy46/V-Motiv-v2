import React, { useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { X } from 'lucide-react-native';
import { color, space } from '../theme';
import type { RootStack } from '../navigation/types';

type Props = NativeStackScreenProps<RootStack, 'VehicleGallery'>;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function VehicleGalleryScreen({ route, navigation }: Props) {
  const { images, initialIndex = 0, title } = route.params;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Close gallery"
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <X size={24} color={color.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
          <Text style={styles.counter}>
            {currentIndex + 1} / {images.length}
          </Text>
        </View>
        <View style={styles.headerPlaceholder} />
      </View>

      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(index);
        }}
        keyExtractor={(_, index) => `gallery-${index}`}
        renderItem={({ item }) => (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: item }}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        )}
      />

      <View style={styles.footer}>
        <FlatList
          data={images}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbnailList}
          keyExtractor={(_, idx) => `thumb-${idx}`}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => setCurrentIndex(index)}
              style={[
                styles.thumbnailWrapper,
                currentIndex === index && styles.thumbnailActive,
              ]}
            >
              <Image source={{ uri: item }} style={styles.thumbnailImage} />
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  closeButton: {
    padding: space.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: space.sm,
  },
  title: {
    color: color.white,
    fontSize: 14,
    fontWeight: '600',
  },
  counter: {
    color: color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  headerPlaceholder: {
    width: 40,
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  footer: {
    paddingVertical: space.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  thumbnailList: {
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  thumbnailWrapper: {
    width: 60,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: color.yellow,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});
