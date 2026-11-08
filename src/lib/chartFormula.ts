/**
 * Tiny formula → rows helper for RPG progression curves.
 * Not a spreadsheet engine — only `a * x^b` (and optional additive `c`).
 */

export type PowerCurveParams = {
  /** Scale factor. */
  a: number;
  /** Exponent. */
  b: number;
  /** Optional constant offset (default 0). */
  c?: number;
  xStart: number;
  xEnd: number;
  /** Step between X values (default 1). */
  step?: number;
};

export type PowerCurvePoint = {
  x: number;
  y: number;
};

/** Evaluate y = a * x^b + c for integer-ish X ranges. */
export function generatePowerCurve(params: PowerCurveParams): PowerCurvePoint[] {
  const a = Number.isFinite(params.a) ? params.a : 1;
  const b = Number.isFinite(params.b) ? params.b : 1;
  const c = Number.isFinite(params.c ?? 0) ? (params.c ?? 0) : 0;
  const step =
    Number.isFinite(params.step) && (params.step as number) !== 0
      ? Math.abs(params.step as number)
      : 1;
  let start = Number.isFinite(params.xStart) ? params.xStart : 1;
  let end = Number.isFinite(params.xEnd) ? params.xEnd : start;
  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  const points: PowerCurvePoint[] = [];
  // Cap rows so a bad prompt can't explode the table.
  const maxPoints = 500;
  for (let x = start, n = 0; x <= end + 1e-9 && n < maxPoints; x += step, n++) {
    const roundedX = Math.round(x * 1e6) / 1e6;
    const raw = a * Math.pow(roundedX, b) + c;
    const y = Number.isFinite(raw) ? Math.round(raw * 1000) / 1000 : 0;
    points.push({ x: roundedX, y });
  }
  return points;
}

/** Dark-theme-friendly series colours (Charts MVP palette). */
export const CHART_SERIES_COLORS = [
  "#6db3a8",
  "#c9a86c",
  "#7a9fd4",
  "#c47a8a",
  "#9b8fd4",
  "#8fbf6d",
] as const;

export function seriesColorAt(index: number, override?: string | null): string {
  if (override && override.trim()) return override.trim();
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}
