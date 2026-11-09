import { describe, expect, it } from 'vitest';
import { candidatePayload, descriptionPayload } from './webrtc-payload';

describe('call signalling payloads', () => {
  it('accepts a plain offer object, which has no toJSON', () => {
    expect(descriptionPayload({ type: 'offer', sdp: 'v=0' })).toEqual({ type: 'offer', sdp: 'v=0' });
  });
  it('uses toJSON when the description has one', () => {
    expect(descriptionPayload({ type: 'offer', sdp: 'ignored', toJSON: () => ({ type: 'offer', sdp: 'from-json' }) })).toEqual({ type: 'offer', sdp: 'from-json' });
  });
  it('refuses to send nothing', () => {
    expect(() => descriptionPayload(null)).toThrow();
  });
  it('builds an ICE candidate with or without toJSON', () => {
    expect(candidatePayload({ candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 })).toMatchObject({ candidate: 'candidate:1', sdpMid: '0' });
    expect(candidatePayload({ toJSON: () => ({ candidate: 'x' }) })).toEqual({ candidate: 'x' });
  });
});
