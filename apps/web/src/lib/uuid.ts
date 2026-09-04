/**
 * crypto.randomUUID() only exists in secure contexts (https:// or localhost) — plain http://
 * access over a LAN IP (e.g. testing from a phone) doesn't qualify, so it's undefined there.
 * Falls back to a non-cryptographic UUID v4; fine here since this only ever labels an event
 * for dedup, it's never used for anything security-sensitive.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
