// When to gently ask someone to rate the app. Pure, so the rules are tested alone.
//
// The ask is neutral and rare: only after the person has used the app a few times, never twice in a short while, and never again after they
// have rated or said no twice. It does not ask "are you happy?" first and send only happy people to the store, which Google's rules forbid.

export interface RatingState {
  /** How many times the app has been opened. */
  sessions: number;
  /** When the person was last asked (milliseconds), or null if never. */
  lastAskedAt: number | null;
  /** How many times they said "not now". */
  declined: number;
  /** They tapped Rate (we cannot know whether they finished, so we do not ask again). */
  rated: boolean;
}

export const initialRatingState = (): RatingState => ({ sessions: 0, lastAskedAt: null, declined: 0, rated: false });

/** Opens before the first ask. */
export const SESSIONS_BEFORE_FIRST_ASK = 5;
/** Quiet period between asks. */
export const DAYS_BETWEEN_ASKS = 60;
/** After this many "not now" answers the person is never asked again. */
export const MAX_DECLINES = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export const recordSession = (state: RatingState): RatingState => ({ ...state, sessions: state.sessions + 1 });

export function shouldAskForRating(state: RatingState, now: number): boolean {
  if (state.rated || state.declined >= MAX_DECLINES) return false;
  if (state.sessions < SESSIONS_BEFORE_FIRST_ASK) return false;
  if (state.lastAskedAt === null) return true;
  return now - state.lastAskedAt >= DAYS_BETWEEN_ASKS * DAY_MS;
}

export const askedNow = (state: RatingState, now: number): RatingState => ({ ...state, lastAskedAt: now });
export const answeredRate = (state: RatingState): RatingState => ({ ...state, rated: true });
export const answeredNotNow = (state: RatingState): RatingState => ({ ...state, declined: state.declined + 1 });

/** A saved value read back from storage, checked: anything damaged starts afresh. */
export function parseRatingState(raw: unknown): RatingState {
  const r = raw as Partial<RatingState> | null;
  if (!r || typeof r !== 'object') return initialRatingState();
  const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  return {
    sessions: whole(r.sessions),
    lastAskedAt: typeof r.lastAskedAt === 'number' && Number.isFinite(r.lastAskedAt) ? r.lastAskedAt : null,
    declined: whole(r.declined),
    rated: r.rated === true,
  };
}
