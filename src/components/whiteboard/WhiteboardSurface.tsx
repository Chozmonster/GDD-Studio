import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type {
  WhiteboardBrush,
  WhiteboardLayer,
  WhiteboardObject,
  WhiteboardPathObject,
  WhiteboardPoint,
  WhiteboardTool,
  WhiteboardViewport,
} from "../../types";
import { renderWhiteboardObject } from "./whiteboardInk";
import {
  DEFAULT_BRUSH,
  DEFAULT_STROKE_FLOW,
  DEFAULT_STROKE_OPACITY,
  findLayer,
  hitTestTop,
  interactiveObjects,
  layerIsDrawable,
  newEntityId,
  objectsIntersectBrush,
  objectBounds,
  paintLayerGroups,
  sanitizePressure,
  shapeBounds,
  translateObject,
} from "./whiteboardModel";

type WhiteboardSurfaceProps = {
  objects: WhiteboardObject[];
  layers: WhiteboardLayer[];
  activeLayerId: string;
  viewport: WhiteboardViewport;
  tool: WhiteboardTool;
  color: string;
  fill: string | null;
  strokeWidth: number;
  brush: WhiteboardBrush;
  strokeOpacity: number;
  strokeFlow: number;
  selectedIds: ReadonlySet<string>;
  onViewportChange: (next: WhiteboardViewport) => void;
  onSelectIds: (ids: Set<string>) => void;
  onCommitObjects: (next: WhiteboardObject[]) => void;
  /** Called before a mutating gesture so the parent can push undo history. */
  onBeforeMutate: () => void;
};

function buildPenPath(args: {
  id: string;
  layerId: string;
  points: WhiteboardPoint[];
  color: string;
  width: number;
  brush: WhiteboardBrush;
  opacity: number;
  flow: number;
}): WhiteboardPathObject {
  const path: WhiteboardPathObject = {
    id: args.id,
    kind: "path",
    layerId: args.layerId,
    mode: "pen",
    points: args.points,
    color: args.color,
    width: args.width,
  };
  if (args.brush !== DEFAULT_BRUSH) path.brush = args.brush;
  if (args.opacity !== DEFAULT_STROKE_OPACITY) path.opacity = args.opacity;
  if (args.flow !== DEFAULT_STROKE_FLOW) path.flow = args.flow;
  return path;
}

type DragMode =
  | { type: "pan"; startX: number; startY: number; origin: WhiteboardViewport }
  | {
      type: "draw-path";
      id: string;
      mode: "pen" | "eraser";
      points: WhiteboardPoint[];
    }
  | {
      type: "draw-shape";
      id: string;
      kind: "line" | "rect" | "ellipse";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      type: "move";
      startWorld: WhiteboardPoint;
      originals: WhiteboardObject[];
      ids: string[];
    }
  | { type: "erase-stroke"; removed: Set<string> }
  | null;

function clientToWorld(
  clientX: number,
  clientY: number,
  el: HTMLElement,
  viewport: WhiteboardViewport,
): WhiteboardPoint {
  const rect = el.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.x) / viewport.zoom,
    y: (clientY - rect.top - viewport.y) / viewport.zoom,
  };
}

/** Sample Pointer Events pressure into a whiteboard point (world space). */
function pointerWorldPoint(
  e: ReactPointerEvent<HTMLDivElement>,
  el: HTMLElement,
  viewport: WhiteboardViewport,
): WhiteboardPoint {
  const world = clientToWorld(e.clientX, e.clientY, el, viewport);
  return {
    ...world,
    pressure: sanitizePressure(e.pressure),
  };
}

/**
 * Interactive light-paper surface: pen / eraser / shapes / select-move + pan-zoom.
 */
export function WhiteboardSurface({
  objects,
  layers,
  activeLayerId,
  viewport,
  tool,
  color,
  fill,
  strokeWidth,
  brush,
  strokeOpacity,
  strokeFlow,
  selectedIds,
  onViewportChange,
  onSelectIds,
  onCommitObjects,
  onBeforeMutate,
}: WhiteboardSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode>(null);
  const spaceDown = useRef(false);
  const [draft, setDraft] = useState<WhiteboardObject | null>(null);
  const [liveObjects, setLiveObjects] = useState<WhiteboardObject[] | null>(
    null,
  );

  const displayObjects = liveObjects ?? objects;
  const activeLayer = findLayer(layers, activeLayerId);
  const canDraw = layerIsDrawable(activeLayer);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nextZoom = Math.min(4, Math.max(0.25, viewport.zoom * factor));
      const wx = (mx - viewport.x) / viewport.zoom;
      const wy = (my - viewport.y) / viewport.zoom;
      onViewportChange({
        x: mx - wx * nextZoom,
        y: my - wy * nextZoom,
        zoom: nextZoom,
      });
    },
    [onViewportChange, viewport],
  );

  const beginPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = rootRef.current;
    if (!el) return;
    const isPan =
      e.button === 1 ||
      (e.button === 0 && (spaceDown.current || e.altKey));
    if (isPan) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        type: "pan",
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...viewport },
      };
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const world = pointerWorldPoint(e, el, viewport);

    if (tool === "select") {
      const selectable = interactiveObjects(objects, layers);
      const hit = hitTestTop(selectable, world.x, world.y);
      let ids: string[];
      if (e.shiftKey && hit) {
        const next = new Set(selectedIds);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        onSelectIds(next);
        ids = [...next];
      } else if (hit) {
        if (!selectedIds.has(hit.id)) {
          onSelectIds(new Set([hit.id]));
          ids = [hit.id];
        } else {
          ids = [...selectedIds];
        }
      } else {
        onSelectIds(new Set());
        ids = [];
      }
      const movableIds = ids.filter((id) =>
        selectable.some((o) => o.id === id),
      );
      if (movableIds.length > 0 && hit) {
        onBeforeMutate();
        dragRef.current = {
          type: "move",
          startWorld: world,
          originals: objects.filter((o) => movableIds.includes(o.id)),
          ids: movableIds,
        };
        setLiveObjects(objects);
      }
      return;
    }

    if (tool === "eraser") {
      // Brush eraser: remove whole objects on editable layers the brush hits.
      // Locked / hidden layers are skipped; width slider is brush diameter.
      if (!canDraw) return;
      onBeforeMutate();
      const brushRadius = Math.max(2, strokeWidth / 2);
      const erasable = interactiveObjects(objects, layers, {
        layerId: activeLayerId,
      });
      const removed = new Set<string>();
      for (const obj of erasable) {
        if (objectsIntersectBrush(obj, world.x, world.y, brushRadius)) {
          removed.add(obj.id);
        }
      }
      dragRef.current = { type: "erase-stroke", removed };
      if (removed.size > 0) {
        setLiveObjects(objects.filter((o) => !removed.has(o.id)));
      }
      return;
    }

    if (!canDraw) return;

    onBeforeMutate();
    if (tool === "pen") {
      const id = newEntityId("path");
      const points = [world];
      dragRef.current = { type: "draw-path", id, mode: "pen", points };
      setDraft(
        buildPenPath({
          id,
          layerId: activeLayerId,
          points,
          color,
          width: strokeWidth,
          brush,
          opacity: strokeOpacity,
          flow: strokeFlow,
        }),
      );
      return;
    }

    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      const id = newEntityId(tool);
      dragRef.current = {
        type: "draw-shape",
        id,
        kind: tool,
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
      };
      setDraft({
        id,
        kind: tool,
        layerId: activeLayerId,
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
        color,
        width: strokeWidth,
        fill: tool === "line" ? null : fill,
      });
    }
  };

  const movePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = rootRef.current;
    if (!drag || !el) return;
    if (drag.type === "pan") {
      onViewportChange({
        x: drag.origin.x + (e.clientX - drag.startX),
        y: drag.origin.y + (e.clientY - drag.startY),
        zoom: drag.origin.zoom,
      });
      return;
    }
    const world = pointerWorldPoint(e, el, viewport);
    if (drag.type === "draw-path") {
      const last = drag.points[drag.points.length - 1];
      if (
        last &&
        Math.hypot(world.x - last.x, world.y - last.y) < 1.2 / viewport.zoom
      ) {
        // Still refresh pressure on a near-stationary hover if it changed a lot.
        if (
          last.pressure !== undefined &&
          Math.abs((world.pressure ?? 0.5) - last.pressure) > 0.08
        ) {
          last.pressure = world.pressure;
          setDraft(
            buildPenPath({
              id: drag.id,
              layerId: activeLayerId,
              points: [...drag.points],
              color,
              width: strokeWidth,
              brush,
              opacity: strokeOpacity,
              flow: strokeFlow,
            }),
          );
        }
        return;
      }
      drag.points.push(world);
      setDraft(
        buildPenPath({
          id: drag.id,
          layerId: activeLayerId,
          points: [...drag.points],
          color,
          width: strokeWidth,
          brush,
          opacity: strokeOpacity,
          flow: strokeFlow,
        }),
      );
      return;
    }
    if (drag.type === "draw-shape") {
      drag.x2 = world.x;
      drag.y2 = world.y;
      setDraft({
        id: drag.id,
        kind: drag.kind,
        layerId: activeLayerId,
        x1: drag.x1,
        y1: drag.y1,
        x2: drag.x2,
        y2: drag.y2,
        color,
        width: strokeWidth,
        fill: drag.kind === "line" ? null : fill,
      });
      return;
    }
    if (drag.type === "move") {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      const moved = new Map(
        drag.originals.map((o) => [o.id, translateObject(o, dx, dy)]),
      );
      setLiveObjects(
        objects.map((o) => (moved.has(o.id) ? moved.get(o.id)! : o)),
      );
      return;
    }
    if (drag.type === "erase-stroke") {
      const brushRadius = Math.max(2, strokeWidth / 2);
      const erasable = interactiveObjects(objects, layers, {
        layerId: activeLayerId,
      });
      let changed = false;
      for (const obj of erasable) {
        if (drag.removed.has(obj.id)) continue;
        if (objectsIntersectBrush(obj, world.x, world.y, brushRadius)) {
          drag.removed.add(obj.id);
          changed = true;
        }
      }
      if (changed) {
        setLiveObjects(objects.filter((o) => !drag.removed.has(o.id)));
      }
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!drag || drag.type === "pan") {
      setDraft(null);
      setLiveObjects(null);
      return;
    }
    if (drag.type === "draw-path") {
      if (drag.points.length >= 1) {
        onCommitObjects([
          ...objects,
          buildPenPath({
            id: drag.id,
            layerId: activeLayerId,
            points: drag.points,
            color,
            width: strokeWidth,
            brush,
            opacity: strokeOpacity,
            flow: strokeFlow,
          }),
        ]);
      }
      setDraft(null);
      return;
    }
    if (drag.type === "draw-shape") {
      const tooSmall =
        Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1) < 2;
      if (!tooSmall) {
        onCommitObjects([
          ...objects,
          {
            id: drag.id,
            kind: drag.kind,
            layerId: activeLayerId,
            x1: drag.x1,
            y1: drag.y1,
            x2: drag.x2,
            y2: drag.y2,
            color,
            width: strokeWidth,
            fill: drag.kind === "line" ? null : fill,
          },
        ]);
      }
      setDraft(null);
      return;
    }
    if (drag.type === "move") {
      if (liveObjects) onCommitObjects(liveObjects);
      setLiveObjects(null);
      return;
    }
    if (drag.type === "erase-stroke") {
      if (drag.removed.size > 0) {
        onCommitObjects(objects.filter((o) => !drag.removed.has(o.id)));
      }
      setLiveObjects(null);
    }
  };

  const cursor =
    tool === "select"
      ? "default"
      : spaceDown.current
        ? "grab"
        : tool === "eraser"
          ? "cell"
          : "crosshair";

  return (
    <div
      ref={rootRef}
      className="whiteboard-surface"
      style={{ cursor }}
      onWheel={onWheel}
      onPointerDown={beginPointer}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      role="application"
      aria-label="Whiteboard canvas"
    >
      <div
        className="whiteboard-surface-world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          className="whiteboard-surface-svg"
          width={4000}
          height={3000}
          viewBox="0 0 4000 3000"
        >
          <defs>
            <pattern
              id="wb-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="rgba(0,0,0,0.06)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            className="whiteboard-paper-bg"
            x={0}
            y={0}
            width={4000}
            height={3000}
            fill="#F7F4EC"
          />
          <rect
            x={0}
            y={0}
            width={4000}
            height={3000}
            fill="url(#wb-grid)"
            pointerEvents="none"
          />
          <g style={{ isolation: "isolate" }}>
            <rect x={0} y={0} width={4000} height={3000} fill="#F7F4EC" />
            {paintLayerGroups(displayObjects, layers).map(
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
            {draft && !layers.some((l) => l.id === draft.layerId && l.visible)
              ? renderWhiteboardObject(draft, `draft-${draft.id}`)
              : null}
          </g>
          {[...selectedIds].map((id) => {
            const obj = displayObjects.find((o) => o.id === id);
            if (!obj) return null;
            const b =
              obj.kind === "path"
                ? (() => {
                    const bounds = objectBounds(obj);
                    const pad = 2;
                    return {
                      x: bounds.x - pad,
                      y: bounds.y - pad,
                      w: bounds.w + pad * 2,
                      h: bounds.h + pad * 2,
                    };
                  })()
                : (() => {
                    const s = shapeBounds(obj);
                    const pad = obj.width / 2 + 2;
                    return {
                      x: s.x - pad,
                      y: s.y - pad,
                      w: s.w + pad * 2,
                      h: s.h + pad * 2,
                    };
                  })();
            return (
              <rect
                key={`sel-${id}`}
                x={b.x}
                y={b.y}
                width={Math.max(1, b.w)}
                height={Math.max(1, b.h)}
                fill="none"
                stroke="#3B82F6"
                strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`}
                pointerEvents="none"
              />
            );
          })}
        </svg>
      </div>
      <p className="muted tiny whiteboard-surface-hint" data-export-ignore>
        Space/Alt+drag or middle-mouse pan · wheel zoom · Delete removes
        selection
      </p>
    </div>
  );
}
