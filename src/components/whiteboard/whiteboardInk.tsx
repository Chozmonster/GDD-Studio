import type { CSSProperties } from "react";
import type {
  WhiteboardObject,
  WhiteboardPathObject,
  WhiteboardTextObject,
} from "../../types";
import {
  DEFAULT_BRUSH,
  pathHasVariableWidth,
  pathStrokeAlpha,
  pathToSvgD,
  pathToVariableWidthOutline,
  shapeBounds,
  softBrushBlur,
  textBlockCenter,
} from "./whiteboardModel";

/** Shared SVG ink for editor surface + embeds/PDF preview. */
export function renderWhiteboardObject(obj: WhiteboardObject, key: string) {
  if (obj.kind === "path") return renderPath(obj, key);
  if (obj.kind === "text") return renderText(obj, key);
  if (obj.kind === "line") {
    return (
      <line
        key={key}
        x1={obj.x1}
        y1={obj.y1}
        x2={obj.x2}
        y2={obj.y2}
        stroke={obj.color}
        strokeWidth={obj.width}
        strokeLinecap="round"
      />
    );
  }
  const b = shapeBounds(obj);
  if (obj.kind === "rect") {
    return (
      <rect
        key={key}
        x={b.x}
        y={b.y}
        width={Math.max(0.1, b.w)}
        height={Math.max(0.1, b.h)}
        fill={obj.fill || "none"}
        stroke={obj.color}
        strokeWidth={obj.width}
      />
    );
  }
  return (
    <ellipse
      key={key}
      cx={b.x + b.w / 2}
      cy={b.y + b.h / 2}
      rx={Math.max(0.1, b.w / 2)}
      ry={Math.max(0.1, b.h / 2)}
      fill={obj.fill || "none"}
      stroke={obj.color}
      strokeWidth={obj.width}
    />
  );
}

function renderText(obj: WhiteboardTextObject, key: string) {
  const lines = obj.text.split("\n");
  const rot = obj.rotation ?? 0;
  const center = textBlockCenter(obj);
  const transform =
    Math.abs(rot) > 1e-6
      ? `rotate(${(rot * 180) / Math.PI} ${center.x} ${center.y})`
      : undefined;
  // Top-left anchor: first baseline ≈ y + 0.85×fontSize (matches estimateTextSize).
  const baselineY = obj.y + obj.fontSize * 0.85;
  return (
    <text
      key={key}
      x={obj.x}
      y={baselineY}
      fill={obj.color}
      fontSize={obj.fontSize}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      transform={transform}
      style={{ whiteSpace: "pre" } as CSSProperties}
    >
      {lines.map((line, i) => (
        <tspan
          key={`${key}-l${i}`}
          x={obj.x}
          dy={i === 0 ? 0 : obj.fontSize * 1.25}
        >
          {line.length === 0 ? "\u00a0" : line}
        </tspan>
      ))}
    </text>
  );
}

function renderPath(obj: WhiteboardPathObject, key: string) {
  // Eraser strokes are not stored as paths in the MVP (tool deletes hits).
  if (obj.mode === "eraser") return null;

  const brush = obj.brush ?? DEFAULT_BRUSH;
  const alpha = pathStrokeAlpha(obj);
  const filterId = `wb-soft-${obj.id}`;
  const style: CSSProperties | undefined =
    brush === "highlighter" ? { mixBlendMode: "multiply" } : undefined;
  const softFilter =
    brush === "soft" ? (
      <defs>
        <filter
          id={filterId}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation={softBrushBlur(obj.width)} />
        </filter>
      </defs>
    ) : null;
  const filterAttr = brush === "soft" ? `url(#${filterId})` : undefined;

  if (pathHasVariableWidth(obj.points)) {
    const d = pathToVariableWidthOutline(obj.points, obj.width);
    if (!d) return null;
    return (
      <g key={key} style={style} opacity={alpha}>
        {softFilter}
        <path d={d} fill={obj.color} stroke="none" filter={filterAttr} />
      </g>
    );
  }
  const d = pathToSvgD(obj.points);
  if (!d) return null;
  return (
    <g key={key} style={style} opacity={alpha}>
      {softFilter}
      <path
        d={d}
        fill="none"
        stroke={obj.color}
        strokeWidth={obj.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={filterAttr}
      />
    </g>
  );
}
