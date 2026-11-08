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

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step = span / count;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) {
    const v = min + step * i;
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

export function ChartPreview({
  document: doc,
  compact = false,
  className = "",
}: ChartPreviewProps) {
  const width = compact ? 520 : 720;
  const height = compact ? 240 : 340;
  const pad = { top: 28, right: 16, bottom: 44, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const { points, yMin, yMax } = buildPlot(doc);
  const yTicks = niceTicks(yMin, yMax);
  const yScale = (y: number) =>
    pad.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;

  const xScale = (index: number) => {
    if (points.length <= 1) return pad.left + innerW / 2;
    return pad.left + (index / (points.length - 1)) * innerW;
  };

  const barGroupWidth =
    points.length > 0 ? innerW / Math.max(points.length, 1) : innerW;
  const barSlot = Math.max(4, barGroupWidth * 0.7);
  const seriesCount = Math.max(doc.series.length, 1);
  const barW = Math.max(2, barSlot / seriesCount - 2);

  return (
    <div className={`chart-preview ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <svg
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
        {/* Grid + axes */}
        {yTicks.map((t) => {
          const y = yScale(t);
          return (
            <g key={`yt-${t}`}>
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
                x={pad.left - 8}
                y={y + 3}
                textAnchor="end"
                fill="var(--muted)"
                fontSize={10}
              >
                {t}
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
          y={height - 10}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize={11}
        >
          {doc.xLabel || "X"}
        </text>
        <text
          x={14}
          y={pad.top + innerH / 2}
          textAnchor="middle"
          fill="var(--muted)"
          fontSize={11}
          transform={`rotate(-90 14 ${pad.top + innerH / 2})`}
        >
          {doc.series.length === 1
            ? doc.series[0]?.name || doc.yLabel || "Y"
            : doc.yLabel || "Y"}
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
                    const top = Math.min(y0, y1);
                    const h = Math.max(1, Math.abs(y1 - y0));
                    const x =
                      groupCenter -
                      barSlot / 2 +
                      vi * (barW + 2);
                    return (
                      <rect
                        key={v.seriesId}
                        x={x}
                        y={top}
                        width={barW}
                        height={h}
                        fill={v.color}
                        opacity={0.92}
                      />
                    );
                  })}
                  <text
                    x={groupCenter}
                    y={pad.top + innerH + 16}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize={10}
                  >
                    {p.xLabel}
                  </text>
                </g>
              );
            })
          : doc.series.map((series, si) => {
              const color = seriesColorAt(si, series.color);
              const coords = points
                .map((p, pi) => {
                  const y = p.values.find((v) => v.seriesId === series.id)?.y;
                  if (y === null || y === undefined) return null;
                  return { x: xScale(pi), y: yScale(y) };
                })
                .filter(Boolean) as Array<{ x: number; y: number }>;
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
                  />
                  {coords.map((c, i) => (
                    <circle
                      key={`${series.id}-pt-${i}`}
                      cx={c.x}
                      cy={c.y}
                      r={3.2}
                      fill={color}
                    />
                  ))}
                </g>
              );
            })}

        {doc.chartType === "line" &&
          points.map((p, pi) => (
            <text
              key={`xl-${pi}`}
              x={xScale(pi)}
              y={pad.top + innerH + 16}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize={10}
            >
              {p.xLabel}
            </text>
          ))}

        {/* Legend */}
        {doc.series.map((s, i) => {
          const color = seriesColorAt(i, s.color);
          const lx = pad.left + i * 110;
          return (
            <g key={`leg-${s.id}`} transform={`translate(${lx}, 12)`}>
              <rect width={10} height={10} rx={2} fill={color} />
              <text x={14} y={9} fill="var(--ink)" fontSize={11}>
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>
      {points.length === 0 && (
        <p className="muted tiny chart-preview-empty">
          Add rows in the data table to plot a curve.
        </p>
      )}
    </div>
  );
}
