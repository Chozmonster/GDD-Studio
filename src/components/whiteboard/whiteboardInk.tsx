import type { WhiteboardObject, WhiteboardPathObject } from "../../types";
import {
  pathHasVariableWidth,
  pathToSvgD,
  pathToVariableWidthOutline,
  shapeBounds,
} from "./whiteboardModel";

/** Shared SVG ink for editor surface + embeds/PDF preview. */
export function renderWhiteboardObject(obj: WhiteboardObject, key: string) {
  if (obj.kind === "path") return renderPath(obj, key);
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

function renderPath(obj: WhiteboardPathObject, key: string) {
  // Eraser strokes are not stored as paths in the MVP (tool deletes hits).
  if (obj.mode === "eraser") return null;
  if (pathHasVariableWidth(obj.points)) {
    const d = pathToVariableWidthOutline(obj.points, obj.width);
    if (!d) return null;
    return <path key={key} d={d} fill={obj.color} stroke="none" />;
  }
  const d = pathToSvgD(obj.points);
  if (!d) return null;
  return (
    <path
      key={key}
      d={d}
      fill="none"
      stroke={obj.color}
      strokeWidth={obj.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
