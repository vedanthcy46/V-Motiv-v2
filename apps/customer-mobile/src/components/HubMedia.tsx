import React, { useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useAppTheme } from '../theme';
import { Carousel } from './Carousel';
import { CaptionScrim } from './CaptionScrim';
import { HubVideoSurface } from './HubVideoSurface';
import { posterFor, type HomeItem } from '../services/home-content';

const PAGE_PADDING = 20; // the Home screen's side padding: each page is a full screen wide and its card sits centred inside, with this margin
const PHOTO_AUTO_MS = 6000;

/**
 * "Inside our hubs": a swipeable row of short videos and a swipeable row of photos, managed by the Operations team. Each card is centred with a
 * margin at both sides and rounded corners, at 16:9, with position dots on the picture. Photos also move on by themselves. Videos play by
 * themselves, muted, looping, with no controls at all (nothing to tap, no play or pause), and only while they are the one in view. A photo opens
 * full screen and can be swiped there too. A picture that will not load shows a plain tile, never a gap.
 */
export function HubMedia({ videos, photos }: { videos: HomeItem[]; photos: HomeItem[] }) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const { width } = useWindowDimensions();
  const cardWidth = width - PAGE_PADDING * 2;
  const cardHeight = Math.round((cardWidth * 9) / 16);
  const [viewer, setViewer] = useState<number | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  if (videos.length + photos.length === 0) return null;

  const caption = (item: HomeItem) => [item.title, item.hubName].filter(Boolean).join(' · ');
  // The words sit on a soft fade at the bottom, not a solid band, so the whole picture or video stays visible.
  const captionBand = (text: string, count: number) => (
    text ? (
      <>
        <CaptionScrim height={Math.round(cardHeight * 0.4)} />
        <View style={[styles.captionRow, { paddingBottom: count > 1 ? 24 : 10 }]}><Text numberOfLines={1} style={styles.captionText}>{text}</Text></View>
      </>
    ) : null
  );

  const videoPage = (item: HomeItem, active: boolean) => {
    const text = caption(item);
    return (
      <View style={[styles.page, { width }]}>
        <View accessible accessibilityLabel={`Hub video${text ? `: ${text}` : ''}`} style={[styles.card, { width: cardWidth, height: cardHeight, backgroundColor: c.brandNavy }]}>
          <HubVideoSurface url={item.mediaUrl} poster={posterFor(item)} active={active} />
          {captionBand(text, videos.length)}
        </View>
      </View>
    );
  };

  const photoPage = (item: HomeItem) => {
    const text = caption(item);
    return (
      <View style={[styles.page, { width }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View photo${text ? `: ${text}` : ''}`}
          onPress={() => setViewer(Math.max(0, photos.findIndex(photo => photo.id === item.id)))}
          style={[styles.card, { width: cardWidth, height: cardHeight, backgroundColor: c.brandNavy }]}
        >
          {!broken[item.id] ? (
            <Image source={{ uri: item.mediaUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} onError={() => setBroken(current => ({ ...current, [item.id]: true }))} accessibilityIgnoresInvertColors />
          ) : null}
          {captionBand(text, photos.length)}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={[styles.heading, { color: c.textPrimary }]}>Inside our hubs</Text>
      {videos.length ? (
        <Carousel style={styles.bleed} data={videos} keyOf={item => item.id} itemWidth={width} dots="overlay" renderItem={(item, _index, active) => videoPage(item, active)} />
      ) : null}
      {photos.length ? (
        <Carousel style={styles.bleed} data={photos} keyOf={item => item.id} itemWidth={width} dots="overlay" autoAdvanceMs={PHOTO_AUTO_MS} renderItem={item => photoPage(item)} />
      ) : null}

      {viewer !== null ? <PhotoViewer photos={photos} start={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

/** Full-screen photos, swiped left and right. Starts on the one that was tapped. */
function PhotoViewer({ photos, start, onClose }: { photos: HomeItem[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [position, setPosition] = useState(start);
  const list = useRef<FlatList<HomeItem>>(null);
  const current = photos[position];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <FlatList
          ref={list}
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.id}
          initialScrollIndex={start}
          getItemLayout={(_data, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={event => setPosition(Math.max(0, Math.min(photos.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <Image source={{ uri: item.mediaUrl }} resizeMode="contain" style={StyleSheet.absoluteFill} accessibilityLabel={[item.title, item.hubName].filter(Boolean).join(', ') || 'Hub photo'} />
            </View>
          )}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={styles.close} hitSlop={8}><X size={24} color="#FFFFFF" /></Pressable>
        <View style={styles.viewerFooter} pointerEvents="none">
          {current && (current.title || current.hubName) ? <Text style={styles.viewerCaption}>{[current.title, current.hubName].filter(Boolean).join(' · ')}</Text> : null}
          {photos.length > 1 ? <Text style={styles.counter}>{position + 1} / {photos.length}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 19, fontWeight: '700' },
  bleed: { marginHorizontal: -PAGE_PADDING },
  page: { alignItems: 'center' },
  card: { borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
  captionRow: { paddingHorizontal: 14, paddingTop: 8 },
  captionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  viewer: { flex: 1, backgroundColor: '#000000' },
  close: { position: 'absolute', top: 48, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  viewerFooter: { position: 'absolute', left: 16, right: 16, bottom: 36, alignItems: 'center', gap: 6 },
  viewerCaption: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  counter: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
});
