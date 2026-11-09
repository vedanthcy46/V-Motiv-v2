/**
 * What goes over the signalling channel for a call. react-native-webrtc returns some of these as plain objects (an offer from
 * createOffer) and some as class instances with toJSON (an ICE candidate), and the mix changes between versions. Calling
 * toJSON() straight on an offer is what stopped calls with "undefined is not a function", so every payload is built here.
 */
type Description = { type?: string | null; sdp?: string | null; toJSON?: () => unknown };

export function descriptionPayload(description: Description | null | undefined): Record<string, unknown> {
  if (!description) throw new Error('No session description to send');
  const json = typeof description.toJSON === 'function' ? description.toJSON() : null;
  if (json && typeof json === 'object') return json as Record<string, unknown>;
  return { type: description.type, sdp: description.sdp };
}

type Candidate = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null; toJSON?: () => unknown };

export function candidatePayload(candidate: Candidate): Record<string, unknown> {
  const json = typeof candidate.toJSON === 'function' ? candidate.toJSON() : null;
  if (json && typeof json === 'object') return json as Record<string, unknown>;
  return { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: candidate.usernameFragment };
}
