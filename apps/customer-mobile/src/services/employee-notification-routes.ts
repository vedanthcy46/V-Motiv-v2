// Pure helpers for opening employee notifications (no React Native imports, so they can be unit tested).

export const OPEN_REFUSAL_MESSAGE: Record<string, string> = {
  NO_LONGER_EMPLOYED: 'Your access has ended.',
  NO_LONGER_AUTHORISED: 'You no longer have access to this job.',
  REASSIGNED: 'This job was reassigned to another inspector.',
  RESOLVED: 'This has already been dealt with.',
  EXPIRED: 'This notification has expired.',
  NO_LINK: 'There is nothing to open for this notification.',
};

/**
 * The inspector job (or review) a notification points at. Only the two routes the Inspector app understands are accepted, and the id
 * must look like an id: anything else (a URL, a different portal's path, path tricks) returns null and nothing is opened.
 */
export function inspectorTargetFromRoute(route: string | null | undefined): { kind: 'job' | 'review'; id: string } | null {
  if (!route || route.length > 200) return null;
  const match = /^\/(inspections|reviews)\/([0-9a-zA-Z_-]{6,64})$/.exec(route.split('?')[0]!);
  if (!match) return null;
  return { kind: match[1] === 'inspections' ? 'job' : 'review', id: match[2]! };
}

/** The data a push message carries, validated. Unknown shapes are ignored rather than guessed at. */
export function parsePushData(data: unknown): { notificationId: string; module: string } | null {
  if (!data || typeof data !== 'object') return null;
  const { notificationId, module } = data as Record<string, unknown>;
  if (typeof notificationId !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(notificationId)) return null;
  return { notificationId, module: typeof module === 'string' ? module : '' };
}

