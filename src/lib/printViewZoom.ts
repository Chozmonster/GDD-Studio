/**
 * Print view magnification preference.
 * UI chrome only (does not affect PDF export) — persisted like pane sizes.
 */

export type PrintViewZoomMode =
  | { kind: "percent"; value: number }
  | { kind: "fit-width" }
  | { kind: "fit-page" };

/** Descending 10% steps for the toolbar select. */
export const PRINT_VIEW_ZOOM_PERCENTS = [
  100, 90, 80, 70, 60, 50, 40, 30, 20, 10,
] as const;

export type PrintViewZoomPercent = (typeof PRINT_VIEW_ZOOM_PERCENTS)[number];

export const DEFAULT_PRINT_VIEW_ZOOM: PrintViewZoomMode = {
  kind: "percent",
  value: 100,
};

const STORAGE_KEY = "gdd-studio:print-view-zoom";

const PERCENT_SET = new Set<number>(PRINT_VIEW_ZOOM_PERCENTS);

export function isPrintViewZoomPercent(n: number): n is PrintViewZoomPercent {
  return PERCENT_SET.has(n);
}

export function serializePrintViewZoom(mode: PrintViewZoomMode): string {
  if (mode.kind === "percent") return String(mode.value);
  return mode.kind;
}

export function parsePrintViewZoom(raw: unknown): PrintViewZoomMode {
  if (raw === "fit-width" || raw === "fit-page") {
    return { kind: raw };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(n) && isPrintViewZoomPercent(n)) {
    return { kind: "percent", value: n };
  }
  return DEFAULT_PRINT_VIEW_ZOOM;
}

export function readPrintViewZoom(): PrintViewZoomMode {
  try {
    return parsePrintViewZoom(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PRINT_VIEW_ZOOM;
  }
}

export function writePrintViewZoom(mode: PrintViewZoomMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializePrintViewZoom(mode));
  } catch {
    /* private mode / quota — ignore */
  }
}

/**
 * Scale factor (0.1–1) so one sheet fits the viewport content box.
 * Fit width uses width only; Fit page uses the tighter of width/height.
 */
export function computeFitZoom(opts: {
  mode: "fit-width" | "fit-page";
  pageWidthPx: number;
  pageHeightPx: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): number {
  const pageW = Math.max(1, opts.pageWidthPx);
  const pageH = Math.max(1, opts.pageHeightPx);
  const viewW = Math.max(1, opts.viewportWidthPx);
  const viewH = Math.max(1, opts.viewportHeightPx);
  const byWidth = viewW / pageW;
  const byHeight = viewH / pageH;
  const raw = opts.mode === "fit-width" ? byWidth : Math.min(byWidth, byHeight);
  // Cap at 100%; floor at 10% so fit never leaves pages unreadably tiny.
  return Math.min(1, Math.max(0.1, raw));
}

export function zoomFactorForMode(
  mode: PrintViewZoomMode,
  fitScale: number,
): number {
  if (mode.kind === "percent") return mode.value / 100;
  return fitScale;
}
