import { useEffect, useState } from "react";

/**
 * Persisted state backed by localStorage. SSR-safe: reads the stored value
 * only after mount, so the server-rendered and first client render both use
 * `initial`, then it hydrates from storage.
 */
export function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore malformed/unavailable storage
    }
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore unavailable storage (private browsing, etc.)
    }
  }, [key, value]);

  return [value, setValue] as const;
}
