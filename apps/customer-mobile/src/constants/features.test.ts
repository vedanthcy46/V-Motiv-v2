import { describe, expect, it } from 'vitest';
import { FEATURE_STATUS, INTRO_FEATURES, comingSoonMessage, featureBadge, isFeatureOpen } from './features';

describe('feature status', () => {
  it('service is the main feature, rental is coming soon and blocked, scrap is open', () => {
    expect(FEATURE_STATUS.service).toBe('main');
    expect(isFeatureOpen('service')).toBe(true);
    expect(isFeatureOpen('rental')).toBe(false);
    expect(isFeatureOpen('scrap')).toBe(true);
    expect(isFeatureOpen('buy')).toBe(true);
    expect(isFeatureOpen('sell')).toBe(true);
  });

  it('labels each feature by its status', () => {
    expect(featureBadge('service')).toBe('MAIN');
    expect(featureBadge('rental')).toBe('COMING SOON');
    expect(featureBadge('scrap')).toBe('OPEN');
  });

  it('only one feature is the main one', () => {
    expect(Object.values(FEATURE_STATUS).filter(status => status === 'main')).toHaveLength(1);
  });

  it('says what is coming soon, and what can be used today', () => {
    const message = comingSoonMessage('rental');
    expect(message.title).toContain('coming soon');
    expect(message.body).toContain('car service');
    expect(message.body).toContain('scrap');
  });
});

describe('opening introduction', () => {
  it('introduces service first, then buy, rentals and scrap', () => {
    expect(INTRO_FEATURES.map(item => item.key)).toEqual(['service', 'buy', 'rental', 'scrap']);
  });

  it('every introduced feature is a real one with copy', () => {
    for (const item of INTRO_FEATURES) {
      expect(FEATURE_STATUS[item.key]).toBeDefined();
      expect(item.title.length).toBeGreaterThan(3);
      expect(item.body.length).toBeGreaterThan(10);
    }
  });
});
