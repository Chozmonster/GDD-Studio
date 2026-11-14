import type { CSSProperties } from "react";
import type { WhiteboardDocument, WhiteboardObject } from "../../types";
import { renderWhiteboardObject } from "./whiteboardInk";
import {
  contentBounds,
  objectBounds,
  paintLayerGroups,
  visibleObjects,
} from "./whiteboardModel";

type WhiteboardPreviewProps = {
  document: WhiteboardDocument;
  /** Fit content into a compact embed frame (centered, no editor chrome). */
  compact?: boolean;
  className?: string;
  selectedIds?: ReadonlySet<string>;
  /** Draft object while drawing (not yet committed). */
  draft?: WhiteboardObject | null;
};

/** Extra viewBox padding so fitted ink isn't flush against the embed edge. */
const EMBED_FIT_PADDING_RATIO = 0.2;

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

function fitViewBox(
  bounds: { x: number; y: number; w: number; h: number },
  padRatio: number,
): { x: number; y: number; w: number; h: number } {
  const padX = bounds.w * padRatio;
  const padY = bounds.h * padRatio;
  return {
    x: bounds.x - padX,
    y: bounds.y - padY,
    w: Math.max(1, bounds.w + padX * 2),
    h: Math.max(1, bounds.h + padY * 2),
  };
}

/**
 * Shared SVG renderer for Whiteboard tab + live document embeds.
 * Compact/embed mode fits content centered in the frame (flowchart fitView
 * spirit): viewBox padded + `xMidYMid meet`, no pan. Hidden layers omitted;
 * layer opacity applied per group.
 */
export function WhiteboardPreview({
  document,
  compact = false,
  className = "",
  selectedIds,
  draft = null,
}: WhiteboardPreviewProps) {
  const layers = document.layers ?? [];
  const painted = visibleObjects(document.objects, layers);
  const rawBounds = contentBounds(draft ? [...painted, draft] : painted);
  const bounds = compact
    ? fitViewBox(rawBounds, EMBED_FIT_PADDING_RATIO)
    : rawBounds;
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
          {paintLayerGroups(document.objects, layers).map(
            ({ layer, objects: layerObjects }) => (
              <g
                key={layer.id}
                className="whiteboard-layer-group"
                opacity={layer.opacity}
              >
                {layerObjects.map((obj) =>
                  renderWhiteboardObject(obj, obj.id),
                )}
                {draft && draft.layerId === layer.id
                  ? renderWhiteboardObject(draft, `draft-${draft.id}`)
                  : null}
              </g>
            ),
          )}
        </g>
        {selectedIds && selectedIds.size > 0
          ? painted
              .filter((o) => selectedIds.has(o.id))
              .map((o) => selectionOutline(o))
          : null}
      </svg>
      {painted.length === 0 && !draft ? (
        <p className="muted tiny whiteboard-preview-empty">Empty board</p>
      ) : null}
    </div>
  );
}
