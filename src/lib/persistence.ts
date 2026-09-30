/** Read a validated JSON value from local storage, falling back safely. */
export function readStoredValue<T>(
  key: string,
  isValid: (value: unknown) => value is T,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    const value: unknown = JSON.parse(stored);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Persist JSON safely; storage may be unavailable in private/restricted contexts. */
export function writeStoredValue(key: string, value: unknown): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The editor remains usable when browser storage is unavailable or full.
  }
}
