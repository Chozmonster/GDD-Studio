import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { seriesColorAt } from "../../lib/chartFormula";
import type { ChartDocument } from "../../types";

type ChartPreviewProps = {
  document: ChartDocument;
  /** Compact height for document embeds. */
  compact?: boolean;
  className?: string;
};

type PlotPoint = {
  xLabel: string;
  xNum: number;
  values: Array<{ seriesId: string; y: number | null; color: string; name: string }>;
};

type HitTarget = {
  key: string;
  cx: number;
  cy: number;
  /** Inclusive bar hit box in SVG coords (optional). */
  x0?: number;
  x1?: number;
  yTop?: number;
  yBottom?: number;
  xHeader: string;
  xValue: string;
  seriesName: string;
  yValue: string;
  color: string;
};

type HoverTip = {
  key: string;
  xSvg: number;
  ySvg: number;
  xHeader: string;
  xValue: string;
  seriesName: string;
  yValue: string;
  color: string;
};

const TICK_FONT = 10;
const TITLE_FONT = 11;
const LEGEND_FONT = 11;
/** Approximate glyph width for UI sans digits/labels at a given font size. */
const CHAR_W = 0.62;
/** Max distance (SVG units) to snap hover to a line point. */
const POINT_HIT_RADIUS = 28;

function approxTextWidth(text: string, fontSize: number): number {
  return Math.max(0, text.length) * fontSize * CHAR_W;
}

function buildPlot(doc: ChartDocument): {
  points: PlotPoint[];
  yMin: number;
  yMax: number;
} {
  const points: PlotPoint[] = doc.rows.map((row, i) => {
    const xNum =
      typeof row.x === "number"
        ? row.x
        : Number.isFinite(Number(row.x))
          ? Number(row.x)
          : i;
    return {
      xLabel: String(row.x),
      xNum,
      values: doc.series.map((s, si) => ({
        seriesId: s.id,
        name: s.name,
        color: seriesColorAt(si, s.color),
        y: row.y[s.id] ?? null,
      })),
    };
  });

  let yMin = 0;
  let yMax = 1;
  let any = false;
  for (const p of points) {
    for (const v of p.values) {
      if (v.y === null) continue;
      if (!any) {
        yMin = v.y;
        yMax = v.y;
        any = true;
      } else {
        yMin = Math.min(yMin, v.y);
        yMax = Math.max(yMax, v.y);
      }
    }
  }
  if (!any) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin = yMin - 1;
    yMax = yMax + 1;
  }
  // Prefer including 0 for bar charts.
  if (doc.chartType === "bar") {
    yMin = Math.min(0, yMin);
    yMax = Math.max(0, yMax);
  }
  return { points, yMin, yMax };
}

/** Round a range/step to 1/2/5 × 10^n (classic "nice number" helper). */
function niceNum(range: number, round: boolean): number {
  const abs = Math.abs(range) || 1;
  const exp = Math.floor(Math.log10(abs));
  const f = abs / 10 ** exp;
  let nf: number;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * 10 ** exp;
}

function niceTicks(
  min: number,
  max: number,
  maxTicks = 5,
): { ticks: number[]; step: number; domainMin: number; domainMax: number } {
  const span = max - min || 1;
  const niceRange = niceNum(span, false);
  const step = niceNum(niceRange / Math.max(maxTicks - 1, 1), true);
  const domainMin = Math.floor(min / step) * step;
  const domainMax = Math.ceil(max / step) * step;
  const n = Math.max(1, Math.round((domainMax - domainMin) / step));
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) {
    // Avoid float drift (e.g. 0.1 + 0.2).
    const v = domainMin + i * step;
    ticks.push(Number(v.toPrecision(12)));
  }
  return { ticks, step, domainMin, domainMax };
}

/** Format a tick value using the step size — no needless trailing decimals. */
function formatTick(value: number, step: number): string {
  if (!Number.isFinite(value)) return "";
  const absStep = Math.abs(step) || 1;
  let decimals = 0;
  if (absStep < 1) {
    decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(absStep - Number.EPSILON))));
  }
  // Guard near-integers that still carry float noise.
  if (decimals === 0) {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < absStep * 1e-6) return String(rounded);
  }
  let s = value.toFixed(decimals);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

/** Format a hovered Y value for the tooltip (compact, readable). */
function formatValue(y: number): string {
  if (!Number.isFinite(y)) return "—";
  if (Number.isInteger(y)) return String(y);
  const abs = Math.abs(y);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    return y.toExponential(3).replace(/\.?0+e/, "e");
  }
  const rounded = Math.round(y * 1e6) / 1e6;
  let s = String(rounded);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

function yAxisTitle(doc: ChartDocument): string {
  if (doc.series.length === 1) {
    return doc.series[0]?.name || doc.yLabel || "Y";
  }
  return doc.yLabel || "Y";
}

type LegendItem = { id: string; name: string; color: string; x: number; y: number };

/** Pack legend items into rows inside the available width; returns layout + row count. */
function layoutLegend(
  series: ChartDocument["series"],
  startX: number,
  maxX: number,
  rowY: number,
  rowGap: number,
): { items: LegendItem[]; rows: number } {
  const items: LegendItem[] = [];
  let x = startX;
  let y = rowY;
  let rows = 1;
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!;
    const w = 14 + approxTextWidth(s.name || "Series", LEGEND_FONT) + 12;
    if (i > 0 && x + w > maxX) {
      x = startX;
      y += rowGap;
      rows += 1;
    }
    items.push({
      id: s.id,
      name: s.name,
      color: seriesColorAt(i, s.color),
      x,
      y,
    });
    x += w;
  }
  return { items, rows };
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

function findNearestHit(
  hits: HitTarget[],
  x: number,
  y: number,
  chartType: ChartDocument["chartType"],
): HitTarget | null {
  if (hits.length === 0) return null;

  // Bars: prefer a hit box that contains the pointer.
  if (chartType === "bar") {
    let contained: HitTarget | null = null;
    let containedDist = Infinity;
    for (const h of hits) {
      if (
        h.x0 == null ||
        h.x1 == null ||
        h.yTop == null ||
        h.yBottom == null
      ) {
        continue;
      }
      if (x >= h.x0 && x <= h.x1 && y >= h.yTop && y <= h.yBottom) {
        const d = Math.hypot(h.cx - x, h.cy - y);
        if (d < containedDist) {
          containedDist = d;
          contained = h;
        }
      }
    }
    if (contained) return contained;

    // Nearest bar by x-column, then vertical distance to bar body.
    let best: HitTarget | null = null;
    let bestScore = Infinity;
    for (const h of hits) {
      if (h.x0 == null || h.x1 == null) continue;
      const midX = (h.x0 + h.x1) / 2;
      const dx = Math.abs(midX - x);
      const halfW = Math.max(4, (h.x1 - h.x0) / 2 + 6);
      if (dx > halfW) continue;
      const yClamped =
        h.yTop != null && h.yBottom != null
          ? Math.min(h.yBottom, Math.max(h.yTop, y))
          : h.cy;
      const dy = Math.abs(yClamped - y);
      const score = dx * 0.35 + dy;
      if (score < bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  }

  // Line: nearest point within snap radius.
  let best: HitTarget | null = null;
  let bestD = POINT_HIT_RADIUS;
  for (const h of hits) {
    const d = Math.hypot(h.cx - x, h.cy - y);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

function tipFromHit(hit: HitTarget): HoverTip {
  return {
    key: hit.key,
    xSvg: hit.cx,
    ySvg: hit.cy,
    xHeader: hit.xHeader,
    xValue: hit.xValue,
    seriesName: hit.seriesName,
    yValue: hit.yValue,
    color: hit.color,
  };
}

export function ChartPreview({
  document: doc,
  compact = false,
  className = "",
}: ChartPreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverTip | null>(null);

  const width = compact ? 520 : 720;
  const height = compact ? 240 : 340;
  const { points, yMin, yMax } = buildPlot(doc);
  const { ticks: yTicks, step: yStep, domainMin, domainMax } = niceTicks(yMin, yMax);
  const tickLabels = yTicks.map((t) => formatTick(t, yStep));
  const maxTickLabelW = Math.max(
    approxTextWidth("0", TICK_FONT),
    ...tickLabels.map((s) => approxTextWidth(s, TICK_FONT)),
  );

  // Horizontal lanes: [Y title][gap][tick labels][gap][plot]
  const yTitleLane = TITLE_FONT + 6;
  const gapTitleTicks = 10;
  const gapTicksAxis = 8;
  const left = Math.ceil(yTitleLane + gapTitleTicks + maxTickLabelW + gapTicksAxis);

  // Vertical lanes: [plot][gap][X ticks][gap][X title]
  const xTickLane = 16;
  const gapTicksTitle = 6;
  const xTitleLane = 16;
  const bottom = xTickLane + gapTicksTitle + xTitleLane + 4;

  const right = 16;
  // Legend sits in the top margin; size top pad from packed rows.
  const legendProbe = layoutLegend(
    doc.series,
    left,
    width - right,
    12,
    16,
  );
  const top = Math.max(28, 8 + legendProbe.rows * 16 + 6);

  const pad = { top, right, bottom, left };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const legend = layoutLegend(doc.series, pad.left, width - pad.right, 12, 16);

  const yScale = (y: number) =>
    pad.top +
    innerH -
    ((y - domainMin) / (domainMax - domainMin || 1)) * innerH;

  const xScale = (index: number) => {
    if (points.length <= 1) return pad.left + innerW / 2;
    return pad.left + (index / (points.length - 1)) * innerW;
  };

  const barGroupWidth =
    points.length > 0 ? innerW / Math.max(points.length, 1) : innerW;
  const barSlot = Math.max(4, barGroupWidth * 0.7);
  const seriesCount = Math.max(doc.series.length, 1);
  const barW = Math.max(2, barSlot / seriesCount - 2);

  // Thin crowded X labels: keep first/last, aim for ~28px per label.
  const minLabelPx = 28;
  const maxLabels = Math.max(2, Math.floor(innerW / minLabelPx));
  const xLabelStride =
    points.length <= maxLabels
      ? 1
      : Math.max(1, Math.ceil((points.length - 1) / (maxLabels - 1)));
  const showXLabel = (pi: number) =>
    pi === 0 ||
    pi === points.length - 1 ||
    pi % xLabelStride === 0;

  const yTitle = yAxisTitle(doc);
  const yTitleX = yTitleLane / 2;
  const yTitleY = pad.top + innerH / 2;
  const tickLabelX = pad.left - gapTicksAxis;
  const xTickY = pad.top + innerH + 14;
  const xTitleY = height - xTitleLane / 2;
  const xHeader = doc.xLabel || "X";

  const hits: HitTarget[] = [];
  if (doc.chartType === "bar") {
    points.forEach((p, pi) => {
      const groupCenter = pad.left + (pi + 0.5) * barGroupWidth;
      p.values.forEach((v, vi) => {
        if (v.y === null) return;
        const y0 = yScale(0);
        const y1 = yScale(v.y);
        const barTop = Math.min(y0, y1);
        const barBottom = Math.max(y0, y1);
        const x = groupCenter - barSlot / 2 + vi * (barW + 2);
        hits.push({
          key: `bar-${pi}-${v.seriesId}`,
          cx: x + barW / 2,
          cy: barTop,
          x0: x,
          x1: x + barW,
          yTop: barTop,
          yBottom: Math.max(barBottom, barTop + 1),
          xHeader,
          xValue: p.xLabel,
          seriesName: v.name || "Series",
          yValue: formatValue(v.y),
          color: v.color,
        });
      });
    });
  } else {
    doc.series.forEach((series, si) => {
      const color = seriesColorAt(si, series.color);
      points.forEach((p, pi) => {
        const y = p.values.find((v) => v.seriesId === series.id)?.y;
        if (y === null || y === undefined) return;
        hits.push({
          key: `pt-${series.id}-${pi}`,
          cx: xScale(pi),
          cy: yScale(y),
          xHeader,
          xValue: p.xLabel,
          seriesName: series.name || "Series",
          yValue: formatValue(y),
          color,
        });
      });
    });
  }

  const onPlotPointerMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const local = clientToSvg(svg, e.clientX, e.clientY);
    if (!local) {
      setHover(null);
      return;
    }
    // Ignore pointer outside the plot area (axes / legend).
    if (
      local.x < pad.left ||
      local.x > width - pad.right ||
      local.y < pad.top ||
      local.y > pad.top + innerH
    ) {
      setHover(null);
      return;
    }
    const hit = findNearestHit(hits, local.x, local.y, doc.chartType);
    setHover(hit ? tipFromHit(hit) : null);
  };

  const clearHover = () => setHover(null);

  // Drop stale tips if the underlying hit set changed (formula refresh, etc.).
  const activeHover =
    hover && hits.some((h) => h.key === hover.key) ? hover : null;

  // Keep tooltip inside the preview (overflow:hidden on .chart-preview).
  const tipStyle = (() => {
    if (!activeHover) return undefined;
    const leftPct = (activeHover.xSvg / width) * 100;
    const topPct = (activeHover.ySvg / height) * 100;
    const flipX = leftPct > 72;
    const flipY = topPct < 28;
    return {
      left: `${leftPct}%`,
      top: `${topPct}%`,
      transform: `translate(${flipX ? "calc(-100% - 10px)" : "10px"}, ${
        flipY ? "8px" : "calc(-100% - 10px)"
      })`,
    } as const;
  })();

  return (
    <div
      className={`chart-preview ${compact ? "is-compact" : ""} ${className}`.trim()}
      onPointerLeave={clearHover}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${doc.chartType} chart ${doc.name}`}
        className="chart-preview-svg"
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="var(--bg-panel)"
          rx={4}
        />
        {/* Grid + Y ticks */}
        {yTicks.map((t, ti) => {
          const y = yScale(t);
          return (
            <g key={`yt-${ti}-${tickLabels[ti]}`}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth={1}
                opacity={0.55}
              />
              <text
                x={tickLabelX}
                y={y + 3}
                textAnchor="end"
                fill="var(--muted)"
                fontSize={TICK_FONT}
              >
                {tickLabels[ti]}
              </text>
            </g>
          );
        })}
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={pad.top + innerH}
          stroke="var(--line-strong)"
          strokeWidth={1.25}
        />
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + innerH}
          y2={pad.top + innerH}
          stroke="var(--line-strong)"
          strokeWidth={1.25}
        />
        <text
          x={pad.left + innerW / 2}
          y={xTitleY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--muted)"
          fontSize={TITLE_FONT}
        >
          {doc.xLabel || "X"}
        </text>
        <text
          x={yTitleX}
          y={yTitleY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--muted)"
          fontSize={TITLE_FONT}
          transform={`rotate(-90 ${yTitleX} ${yTitleY})`}
        >
          {yTitle}
        </text>

        {doc.chartType === "bar"
          ? points.map((p, pi) => {
              const groupCenter = pad.left + (pi + 0.5) * barGroupWidth;
              return (
                <g key={doc.rows[pi]?.id ?? `bar-${pi}`}>
                  {p.values.map((v, vi) => {
                    if (v.y === null) return null;
                    const y0 = yScale(0);
                    const y1 = yScale(v.y);
                    const barTop = Math.min(y0, y1);
                    const h = Math.max(1, Math.abs(y1 - y0));
                    const x =
                      groupCenter - barSlot / 2 + vi * (barW + 2);
                    const key = `bar-${pi}-${v.seriesId}`;
                    const active = activeHover?.key === key;
                    return (
                      <rect
                        key={v.seriesId}
                        x={x}
                        y={barTop}
                        width={barW}
                        height={h}
                        fill={v.color}
                        opacity={active ? 1 : 0.92}
                        stroke={active ? "var(--ink-strong)" : "none"}
                        strokeWidth={active ? 1.25 : 0}
                        pointerEvents="none"
                      />
                    );
                  })}
                  {showXLabel(pi) && (
                    <text
                      x={groupCenter}
                      y={xTickY}
                      textAnchor="middle"
                      fill="var(--muted)"
                      fontSize={TICK_FONT}
                    >
                      {p.xLabel}
                    </text>
                  )}
                </g>
              );
            })
          : doc.series.map((series, si) => {
              const color = seriesColorAt(si, series.color);
              const coords = points
                .map((p, pi) => {
                  const y = p.values.find((v) => v.seriesId === series.id)?.y;
                  if (y === null || y === undefined) return null;
                  return { x: xScale(pi), y: yScale(y), pi };
                })
                .filter(Boolean) as Array<{ x: number; y: number; pi: number }>;
              if (coords.length === 0) return null;
              const d = coords
                .map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`)
                .join(" ");
              return (
                <g key={series.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                  {coords.map((c) => {
                    const key = `pt-${series.id}-${c.pi}`;
                    const active = activeHover?.key === key;
                    return (
                      <circle
                        key={key}
                        cx={c.x}
                        cy={c.y}
                        r={active ? 5 : 3.2}
                        fill={color}
                        stroke={active ? "var(--ink-strong)" : "none"}
                        strokeWidth={active ? 1.25 : 0}
                        pointerEvents="none"
                      />
                    );
                  })}
                </g>
              );
            })}

        {doc.chartType === "line" &&
          points.map((p, pi) =>
            showXLabel(pi) ? (
              <text
                key={`xl-${pi}`}
                x={xScale(pi)}
                y={xTickY}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={TICK_FONT}
              >
                {p.xLabel}
              </text>
            ) : null,
          )}

        {/* Legend */}
        {legend.items.map((item) => (
          <g key={`leg-${item.id}`} transform={`translate(${item.x}, ${item.y})`}>
            <rect width={10} height={10} rx={2} fill={item.color} />
            <text x={14} y={9} fill="var(--ink)" fontSize={LEGEND_FONT}>
              {item.name}
            </text>
          </g>
        ))}

        {/* Invisible plot hit surface — nearest point/bar tooltip. */}
        {hits.length > 0 && (
          <rect
            className="chart-preview-hit"
            x={pad.left}
            y={pad.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onPlotPointerMove}
            onPointerLeave={clearHover}
            onPointerCancel={clearHover}
          />
        )}
      </svg>
      {activeHover && (
        <div
          className="chart-preview-tooltip"
          style={tipStyle}
          role="tooltip"
          data-export-ignore="true"
        >
          <div className="chart-preview-tooltip-row">
            <span className="chart-preview-tooltip-label">
              {activeHover.xHeader}
            </span>
            <span className="chart-preview-tooltip-value">
              {activeHover.xValue}
            </span>
          </div>
          <div className="chart-preview-tooltip-row">
            <span
              className="chart-preview-tooltip-swatch"
              style={{ background: activeHover.color }}
              aria-hidden
            />
            <span className="chart-preview-tooltip-label">
              {activeHover.seriesName}
            </span>
            <span className="chart-preview-tooltip-value">
              {activeHover.yValue}
            </span>
          </div>
        </div>
      )}
      {points.length === 0 && (
        <p className="muted tiny chart-preview-empty">
          Add rows in the data table to plot a curve.
        </p>
      )}
    </div>
  );
}
