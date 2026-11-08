import type { ChartDocument, ChartRow, ChartSeries } from "../../types";

export function emptyChartDocument(
  id = "main",
  name = "Main",
): ChartDocument {
  const seriesId = "series-1";
  return {
    format: "gdd-studio-chart",
    version: 1,
    id,
    name: name || (id === "main" ? "Main" : id),
    description: "",
    chartType: "line",
    xLabel: "Level",
    yLabel: "Value",
    series: [{ id: seriesId, name: "Series 1" }],
    rows: [],
  };
}

export function cloneChart(doc: ChartDocument): ChartDocument {
  return structuredClone(doc);
}

export function newEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function normalizeChart(doc: ChartDocument): ChartDocument {
  const series: ChartSeries[] =
    Array.isArray(doc.series) && doc.series.length > 0
      ? doc.series.map((s, i) => ({
          id: String(s.id || `series-${i + 1}`),
          name: String(s.name || `Series ${i + 1}`),
          color: s.color?.trim() || undefined,
        }))
      : [{ id: "series-1", name: "Series 1" }];

  const seriesIds = new Set(series.map((s) => s.id));
  const rows: ChartRow[] = Array.isArray(doc.rows)
    ? doc.rows.map((r, i) => {
        const y: Record<string, number | null> = {};
        for (const s of series) {
          const raw = r.y?.[s.id];
          if (raw === null || raw === undefined || raw === ("" as unknown)) {
            y[s.id] = null;
          } else {
            const n = typeof raw === "number" ? raw : Number(raw);
            y[s.id] = Number.isFinite(n) ? n : null;
          }
        }
        // Drop unknown series keys.
        for (const key of Object.keys(r.y ?? {})) {
          if (!seriesIds.has(key)) continue;
        }
        return {
          id: String(r.id || `row-${i + 1}`),
          x: r.x,
          y,
        };
      })
    : [];

  return {
    format: "gdd-studio-chart",
    version: 1,
    id: doc.id || "main",
    name: doc.name?.trim() || (doc.id === "main" ? "Main" : doc.id || "Untitled"),
    description: String(doc.description ?? ""),
    chartType: doc.chartType === "bar" ? "bar" : "line",
    xLabel: String(doc.xLabel ?? "Level"),
    yLabel: String(doc.yLabel ?? "Value"),
    series,
    rows,
  };
}

/** Coerce a cell string to number | null (blank → null). */
export function parseNumericCell(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Parse X cell — prefer number when the whole string is numeric. */
export function parseXCell(raw: string): number | string {
  const t = raw.trim();
  if (!t) return "";
  const n = Number(t);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t)) return n;
  return t;
}
