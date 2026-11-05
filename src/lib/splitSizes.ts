/** Persist resizable pane sizes across reloads (per surface key). */

const PREFIX = "gdd-studio:split:";
/** Absolute bounds — keys hold only pixel sizes, never project content. */
const ABS_MIN = 40;
const ABS_MAX = 8_000;

export function readSplitSize(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < ABS_MIN || n > ABS_MAX) return fallback;
    return Math.round(n);
  } catch {
    return fallback;
  }
}

export function writeSplitSize(key: string, size: number): void {
  try {
    if (!Number.isFinite(size)) return;
    const n = Math.round(Math.min(ABS_MAX, Math.max(ABS_MIN, size)));
    localStorage.setItem(PREFIX + key, String(n));
  } catch {
    /* private mode / quota — ignore */
  }
}
