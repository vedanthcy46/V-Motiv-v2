// What a passer-by may do through a vehicle's V MOTIV Connect sticker, beyond the one-way "alert the owner" message.
// The owner sets these per vehicle; both default to on, so every existing sticker keeps working as it did. They are kept in the link's
// metadata, so no database change is needed. The one-way alert is deliberately not switchable here: it is how someone reports a
// crash, a blocked car or lights left on, and a sticker that can never deliver that is pointless. Switching the whole sticker off is
// the existing pause (status DISABLED).

export type ConnectContactPreferences = {
  /** A passer-by may start a privacy-protected voice call. */
  callingEnabled: boolean;
  /** A passer-by may start a private chat and send chat messages. */
  messagingEnabled: boolean;
};

export const DEFAULT_CONNECT_CONTACT_PREFERENCES: ConnectContactPreferences = { callingEnabled: true, messagingEnabled: true };

/** Reads the preferences from a link's metadata; anything missing or not a boolean stays at the default (on). */
export function readContactPreferences(metadata: unknown): ConnectContactPreferences {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const prefs = record.contactPreferences && typeof record.contactPreferences === 'object' ? (record.contactPreferences as Record<string, unknown>) : {};
  return {
    callingEnabled: typeof prefs.callingEnabled === 'boolean' ? prefs.callingEnabled : DEFAULT_CONNECT_CONTACT_PREFERENCES.callingEnabled,
    messagingEnabled: typeof prefs.messagingEnabled === 'boolean' ? prefs.messagingEnabled : DEFAULT_CONNECT_CONTACT_PREFERENCES.messagingEnabled,
  };
}

/** Returns a copy of the metadata with the given preferences applied, keeping everything else in it (sticker image and so on). */
export function withContactPreferences(metadata: unknown, update: Partial<ConnectContactPreferences>): Record<string, unknown> {
  const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
  record.contactPreferences = { ...readContactPreferences(metadata), ...update };
  return record;
}
