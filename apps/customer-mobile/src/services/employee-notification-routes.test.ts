import { describe, expect, it } from 'vitest';
import { inspectorTargetFromRoute, parsePushData } from './employee-notification-routes';

describe('inspector notification routes', () => {
  it('accepts only job and review routes with an id', () => {
    expect(inspectorTargetFromRoute('/inspections/6f1c2b9e-1d0a-4f0e-9b57-0a8e5f2c7d11')).toEqual({ kind: 'job', id: '6f1c2b9e-1d0a-4f0e-9b57-0a8e5f2c7d11' });
    expect(inspectorTargetFromRoute('/reviews/abc123_def')).toEqual({ kind: 'review', id: 'abc123_def' });
  });
  it('refuses URLs, other portals, path tricks and missing ids', () => {
    for (const bad of ['https://evil.example/inspections/abcdef', '//evil.example/x', '/inspections/../admin', '/payments/abcdef12', '/inspections', '/inspections/ab', '', null, undefined, '/inspections/abc def1']) {
      expect(inspectorTargetFromRoute(bad as string)).toBeNull();
    }
  });
});

describe('push payload parsing', () => {
  it('reads a well-formed payload and ignores everything else', () => {
    expect(parsePushData({ notificationId: '6f1c2b9e-1d0a-4f0e-9b57-0a8e5f2c7d11', module: 'INSPECTION', actionRoute: '/x' })).toEqual({ notificationId: '6f1c2b9e-1d0a-4f0e-9b57-0a8e5f2c7d11', module: 'INSPECTION' });
    expect(parsePushData({ notificationId: 'nope' })).toBeNull();
    expect(parsePushData(null)).toBeNull();
    expect(parsePushData('x')).toBeNull();
  });
});
