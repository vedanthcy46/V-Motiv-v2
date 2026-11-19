import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

// Plays a hub video inside its card: muted, looping, with no controls of any kind (no play mark, no pause, nothing to tap). It uses the
// `expo-video` module when the app was built with it. In a build without it nothing breaks: the card simply shows the video's cover image.
// To switch playback on: `npx expo install expo-video`, then make a new app build.

type PlayerLike = { play(): void; loop: boolean; muted: boolean };
type VideoLib = {
  useVideoPlayer: (source: string, setup?: (player: PlayerLike) => void) => PlayerLike;
  VideoView: React.ComponentType<Record<string, unknown>>;
};

let lib: VideoLib | null = null;
let loadProblem = '';
try {
  // Metro treats a require inside try/catch as optional, so the bundle builds whether or not the module is installed.
  lib = require('expo-video') as VideoLib;
} catch (error) {
  lib = null;
  loadProblem = error instanceof Error ? error.message : String(error);
}

// Say so once in development, with the real reason, so "the video is not playing" is never a mystery.
if (!lib && typeof __DEV__ !== 'undefined' && __DEV__) {
  if (/native module|ExpoVideo/i.test(loadProblem)) {
    console.warn(`[HUB VIDEO] The expo-video package is installed, but this app build does not contain its native part, so hub videos show only their cover image. Make a new native build (npx expo run:android, or a new EAS build): reloading the app is not enough. Detail: ${loadProblem}`);
  } else {
    console.warn(`[HUB VIDEO] expo-video could not be loaded: ${loadProblem}. If it is not installed run: npx expo install expo-video. If it is, restart Metro with: npx expo start --clear`);
  }
}

/** True when this build can play video inside the card. */
export const inlineVideoAvailable = lib !== null;

interface Props {
  url: string;
  poster: string | null;
  /** The card is the one in view and the screen is being looked at: only then does the video load and play. */
  active: boolean;
}

/** Fills its parent. Shows the cover image until the first video frame is ready, so there is never a black flash. */
export function HubVideoSurface({ url, poster, active }: Props) {
  const cover = poster ? <Image source={{ uri: poster }} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors /> : null;
  if (!lib || !active) return <View style={StyleSheet.absoluteFill}>{cover}</View>;
  return <InlineVideo lib={lib} url={url} cover={cover} />;
}

function InlineVideo({ lib: video, url, cover }: { lib: VideoLib; url: string; cover: React.ReactNode }) {
  const player = video.useVideoPlayer(url, instance => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  const [ready, setReady] = useState(false);

  const VideoView = video.VideoView;
  return (
    <View style={StyleSheet.absoluteFill}>
      {cover}
      <VideoView
        player={player}
        nativeControls={false}
        contentFit="cover"
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        surfaceType="textureView"
        onFirstFrameRender={() => setReady(true)}
        style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
      />
    </View>
  );
}
