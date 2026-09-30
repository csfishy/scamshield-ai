const STORAGE_KEY = "scamshield.anonymous-device-id.v1";
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let volatileId: string | undefined;

/**
 * Anonymous quota identifier only. It is random, contains no fingerprint
 * inputs, and never leaves this origin except in the /analyze request header.
 */
export function anonymousDeviceId(): string {
  if (volatileId) return volatileId;
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored && uuidV4.test(stored))
      return (volatileId = stored.toLowerCase());
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
  const created = globalThis.crypto.randomUUID();
  volatileId = created;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, created);
  } catch {
    // The module-level value remains stable for this page session.
  }
  return created;
}

export const deviceIdStorageKey = STORAGE_KEY;
