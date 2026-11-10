import type { CSSProperties } from "react";
import type { WhiteboardDocument, WhiteboardObject } from "../../types";
import { renderWhiteboardObject } from "./whiteboardInk";
import { contentBounds, objectBounds } from "./whiteboardModel";

type WhiteboardPreviewProps = {
  document: WhiteboardDocument;
  /** Fit content into a compact embed frame. */
  compact?: boolean;
  className?: string;
  selectedIds?: ReadonlySet<string>;
  /** Draft object while drawing (not yet committed). */
  draft?: WhiteboardObject | null;
};

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
          {objects.map((obj) => renderWhiteboardObject(obj, obj.id))}
          {draft
            ? renderWhiteboardObject(draft, `draft-${draft.id}`)
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
