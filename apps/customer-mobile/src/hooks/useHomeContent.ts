import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { emptyHomeContent, type HomeContent } from '../services/home-content';
import { fetchHomeContent, readSavedHomeContent } from '../services/home-content-api';

/**
 * The Home screen's banners and hub media. The saved copy appears immediately, then the live content replaces it. If the server cannot be
 * reached the saved copy stays; with none, Home shows no promotional sections. It never shows an error: this content is a bonus, not a need.
 */
export function useHomeContent(city: string): HomeContent {
  const [content, setContent] = useState<HomeContent>(emptyHomeContent());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readSavedHomeContent(city).then(saved => { if (active && saved) setContent(saved); });
      void fetchHomeContent(city).then(fresh => { if (active) setContent(fresh); }).catch(() => undefined);
      return () => { active = false; };
    }, [city]),
  );

  return content;
}
