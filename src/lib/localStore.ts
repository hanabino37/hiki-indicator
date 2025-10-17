const NS = "hiki:ui:";
export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveState<T>(key: string, value: T) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {}
}
export function resetState(key: string) {
  try { localStorage.removeItem(NS + key); } catch {}
}
