/** Persist resizable pane sizes across reloads (per surface key). */

const PREFIX = "gdd-studio:split:";

export function readSplitSize(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

export function writeSplitSize(key: string, size: number): void {
  try {
    localStorage.setItem(PREFIX + key, String(Math.round(size)));
  } catch {
    /* private mode / quota — ignore */
  }
}
