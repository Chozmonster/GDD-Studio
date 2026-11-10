import type { CSSProperties } from "react";
import type { WhiteboardDocument, WhiteboardObject } from "../../types";
import {
  contentBounds,
  objectBounds,
  pathToSvgD,
  shapeBounds,
} from "./whiteboardModel";

type WhiteboardPreviewProps = {
  document: WhiteboardDocument;
  /** Fit content into a compact embed frame. */
  compact?: boolean;
  className?: string;
  selectedIds?: ReadonlySet<string>;
  /** Draft object while drawing (not yet committed). */
  draft?: WhiteboardObject | null;
};

function renderObject(
  obj: WhiteboardObject,
  selected: boolean,
  key: string,
) {
  const selClass = selected ? " whiteboard-obj is-selected" : " whiteboard-obj";
  if (obj.kind === "path") {
    // Eraser strokes are not stored as paths in the MVP (tool deletes hits).
    if (obj.mode === "eraser") return null;
    const d = pathToSvgD(obj.points);
    if (!d) return null;
    return (
      <path
        key={key}
        className={`whiteboard-path${selClass}`}
        d={d}
        fill="none"
        stroke={obj.color}
        strokeWidth={obj.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (obj.kind === "line") {
    return (
      <line
        key={key}
        className={`whiteboard-shape${selClass}`}
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
        className={`whiteboard-shape${selClass}`}
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
      className={`whiteboard-shape${selClass}`}
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

function selectionOutline(obj: WhiteboardObject) {
  const b = objectBounds(obj);
  return (
    <rect
      key={`sel-${obj.id}`}
      className="whiteboard-selection-box"
      x={b.x}
      y={b.y}
      width={Math.max(1, b.w)}
      height={Math.max(1, b.h)}
      fill="none"
      stroke="var(--accent, #4ea1ff)"
      strokeWidth={1}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  );
}

/**
 * Shared SVG renderer for Whiteboard tab + live document embeds.
 * Uses an isolated layer so eraser strokes (`destination-out`) punch paper
 * without eating the dark app chrome behind the board.
 */
export function WhiteboardPreview({
  document,
  compact = false,
  className = "",
  selectedIds,
  draft = null,
}: WhiteboardPreviewProps) {
  const objects = document.objects;
  const bounds = contentBounds(
    draft ? [...objects, draft] : objects,
  );
  const style: CSSProperties | undefined = compact
    ? undefined
    : { width: "100%", height: "100%" };

  return (
    <div
      className={
        compact
          ? `whiteboard-preview is-compact ${className}`.trim()
          : `whiteboard-preview ${className}`.trim()
      }
      style={style}
    >
      <svg
        className="whiteboard-preview-svg"
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={document.name || "Whiteboard"}
      >
        <rect
          className="whiteboard-paper-bg"
          x={bounds.x}
          y={bounds.y}
          width={bounds.w}
          height={bounds.h}
          fill="#F4F1EA"
        />
        {/* Isolated group so destination-out eraser only punches this layer. */}
        <g className="whiteboard-ink-layer" style={{ isolation: "isolate" }}>
          <rect
            x={bounds.x}
            y={bounds.y}
            width={bounds.w}
            height={bounds.h}
            fill="#F7F4EC"
          />
          {objects.map((obj) =>
            renderObject(obj, Boolean(selectedIds?.has(obj.id)), obj.id),
          )}
          {draft
            ? renderObject(draft, false, `draft-${draft.id}`)
            : null}
        </g>
        {selectedIds && selectedIds.size > 0
          ? objects
              .filter((o) => selectedIds.has(o.id))
              .map((o) => selectionOutline(o))
          : null}
      </svg>
      {objects.length === 0 && !draft ? (
        <p className="muted tiny whiteboard-preview-empty">Empty board</p>
      ) : null}
    </div>
  );
}
