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
  WhiteboardSelectMode,
  WhiteboardTextObject,
  WhiteboardTool,
  WhiteboardViewport,
} from "../../types";
import { renderWhiteboardObject } from "./whiteboardInk";
import {
  DEFAULT_BRUSH,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_FLOW,
  DEFAULT_STROKE_OPACITY,
  estimateTextSize,
  findLayer,
  hitTestRotateHandle,
  hitTestScaleHandle,
  hitTestTop,
  interactiveObjects,
  layerIsDrawable,
  MAX_TEXT_CHARS,
  newEntityId,
  objectsInsideLasso,
  objectsIntersectBrush,
  objectsIntersectingRect,
  objectBounds,
  paintLayerGroups,
  rotateHandlePosition,
  rotateObjectAround,
  sanitizePressure,
  scaleHandleOrigin,
  scaleHandlePosition,
  scaleObjectAround,
  type ScaleHandle,
  translateObject,
  unionBounds,
  type WorldBounds,
} from "./whiteboardModel";

type WhiteboardSurfaceProps = {
  objects: WhiteboardObject[];
  layers: WhiteboardLayer[];
  activeLayerId: string;
  viewport: WhiteboardViewport;
  tool: WhiteboardTool;
  selectMode: WhiteboardSelectMode;
  color: string;
  fill: string | null;
  strokeWidth: number;
  brush: WhiteboardBrush;
  strokeOpacity: number;
  strokeFlow: number;
  fontSize: number;
  selectedIds: ReadonlySet<string>;
  onViewportChange: (next: WhiteboardViewport) => void;
  onSelectIds: (ids: Set<string>) => void;
  onCommitObjects: (next: WhiteboardObject[]) => void;
  /** Called before a mutating gesture so the parent can push undo history. */
  onBeforeMutate: () => void;
};

type TextEditSession = {
  id: string;
  layerId: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  rotation?: number;
  isNew: boolean;
  originalText: string;
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
  | {
      type: "marquee";
      start: WhiteboardPoint;
      current: WhiteboardPoint;
      additive: boolean;
    }
  | {
      type: "lasso";
      points: WhiteboardPoint[];
      additive: boolean;
    }
  | {
      type: "scale";
      handle: ScaleHandle;
      origin: { x: number; y: number };
      startBounds: WorldBounds;
      startWorld: WhiteboardPoint;
      originals: WhiteboardObject[];
      ids: string[];
      uniform: boolean;
    }
  | {
      type: "rotate";
      center: { x: number; y: number };
      startAngle: number;
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
 * Interactive light-paper surface: pen / eraser / shapes / text / select-transform + pan-zoom.
 */
export function WhiteboardSurface({
  objects,
  layers,
  activeLayerId,
  viewport,
  tool,
  selectMode,
  color,
  fill,
  strokeWidth,
  brush,
  strokeOpacity,
  strokeFlow,
  fontSize,
  selectedIds,
  onViewportChange,
  onSelectIds,
  onCommitObjects,
  onBeforeMutate,
}: WhiteboardSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode>(null);
  const spaceDown = useRef(false);
  const lastTextClick = useRef<{ id: string; at: number } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const textEditRef = useRef<TextEditSession | null>(null);
  const [draft, setDraft] = useState<WhiteboardObject | null>(null);
  const [liveObjects, setLiveObjects] = useState<WhiteboardObject[] | null>(
    null,
  );
  const [marqueeRect, setMarqueeRect] = useState<WorldBounds | null>(null);
  const [lassoPoints, setLassoPoints] = useState<WhiteboardPoint[] | null>(
    null,
  );
  const [textEdit, setTextEdit] = useState<TextEditSession | null>(null);
  textEditRef.current = textEdit;

  const displayObjects = liveObjects ?? objects;
  const activeLayer = findLayer(layers, activeLayerId);
  const canDraw = layerIsDrawable(activeLayer);
  const selectedObjects = displayObjects.filter((o) => selectedIds.has(o.id));
  const selectionBox = unionBounds(selectedObjects);

  /** Commit + clear the active text session at most once. */
  const finishTextEdit = useCallback(() => {
    const session = textEditRef.current;
    if (!session) return;
    textEditRef.current = null;
    setTextEdit(null);

    const cleaned = session.text.replace(/\r\n/g, "\n").slice(0, MAX_TEXT_CHARS);
    const trimmed = cleaned.trim();
    if (session.isNew) {
      if (!trimmed) return;
      const obj: WhiteboardTextObject = {
        id: session.id,
        kind: "text",
        layerId: session.layerId,
        x: session.x,
        y: session.y,
        text: cleaned,
        color: session.color,
        fontSize: session.fontSize,
      };
      if (session.rotation !== undefined && Math.abs(session.rotation) > 1e-6) {
        obj.rotation = session.rotation;
      }
      onBeforeMutate();
      onCommitObjects([...objects, obj]);
      onSelectIds(new Set([obj.id]));
      return;
    }
    if (!trimmed) {
      onBeforeMutate();
      onCommitObjects(objects.filter((o) => o.id !== session.id));
      onSelectIds(new Set());
      return;
    }
    const existing = objects.find((o) => o.id === session.id);
    if (
      existing &&
      existing.kind === "text" &&
      existing.text === cleaned &&
      existing.color === session.color &&
      existing.fontSize === session.fontSize
    ) {
      return;
    }
    onBeforeMutate();
    onCommitObjects(
      objects.map((o) => {
        if (o.id !== session.id || o.kind !== "text") return o;
        return {
          ...o,
          text: cleaned,
          color: session.color,
          fontSize: session.fontSize,
        };
      }),
    );
  }, [objects, onBeforeMutate, onCommitObjects, onSelectIds]);

  const beginTextEdit = useCallback(
    (session: TextEditSession) => {
      textEditRef.current = session;
      setTextEdit(session);
      onSelectIds(new Set([session.id]));
      requestAnimationFrame(() => {
        const el = textAreaRef.current;
        if (!el) return;
        el.focus();
        el.select();
      });
    },
    [onSelectIds],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLTextAreaElement)) {
        spaceDown.current = true;
      }
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

  // Keep in-progress edit colours/sizes in sync with toolbar while typing.
  useEffect(() => {
    if (!textEditRef.current) return;
    setTextEdit((prev) =>
      prev
        ? {
            ...prev,
            color,
            fontSize: Number.isFinite(fontSize) ? fontSize : DEFAULT_FONT_SIZE,
          }
        : prev,
    );
  }, [color, fontSize]);

  // Leaving draw tools while editing commits the session.
  useEffect(() => {
    if (tool === "text" || tool === "select") return;
    if (textEditRef.current) finishTextEdit();
  }, [tool, finishTextEdit]);

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

    // Finish text edit when clicking away from the textarea.
    if (textEditRef.current && e.target instanceof Node) {
      const area = textAreaRef.current;
      if (area && area.contains(e.target as Node)) return;
      finishTextEdit();
    }

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

    const world = pointerWorldPoint(e, el, viewport);

    if (tool === "text") {
      if (!canDraw) return;
      e.preventDefault();
      const selectable = interactiveObjects(objects, layers, {
        layerId: activeLayerId,
      });
      const hit = hitTestTop(selectable, world.x, world.y);
      if (hit && hit.kind === "text") {
        beginTextEdit({
          id: hit.id,
          layerId: hit.layerId,
          x: hit.x,
          y: hit.y,
          text: hit.text,
          color: hit.color,
          fontSize: hit.fontSize,
          rotation: hit.rotation,
          isNew: false,
          originalText: hit.text,
        });
        return;
      }
      beginTextEdit({
        id: newEntityId("text"),
        layerId: activeLayerId,
        x: world.x,
        y: world.y,
        text: "Text",
        color,
        fontSize: Number.isFinite(fontSize) ? fontSize : DEFAULT_FONT_SIZE,
        isNew: true,
        originalText: "",
      });
      return;
    }

    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    if (tool === "select") {
      const selectable = interactiveObjects(objects, layers);
      const selectedLive = selectable.filter((o) => selectedIds.has(o.id));
      const box = unionBounds(selectedLive);

      if (box) {
        const scaleHandle = hitTestScaleHandle(
          box,
          world.x,
          world.y,
          viewport.zoom,
        );
        if (scaleHandle) {
          onBeforeMutate();
          dragRef.current = {
            type: "scale",
            handle: scaleHandle,
            origin: scaleHandleOrigin(box, scaleHandle),
            startBounds: box,
            startWorld: world,
            originals: objects.filter((o) => selectedIds.has(o.id)),
            ids: [...selectedIds],
            uniform: e.shiftKey,
          };
          setLiveObjects(objects);
          return;
        }
        if (hitTestRotateHandle(box, world.x, world.y, viewport.zoom)) {
          onBeforeMutate();
          dragRef.current = {
            type: "rotate",
            center: {
              x: box.x + box.w / 2,
              y: box.y + box.h / 2,
            },
            startAngle: Math.atan2(
              world.y - (box.y + box.h / 2),
              world.x - (box.x + box.w / 2),
            ),
            originals: objects.filter((o) => selectedIds.has(o.id)),
            ids: [...selectedIds],
          };
          setLiveObjects(objects);
          return;
        }
      }

      const hit = hitTestTop(selectable, world.x, world.y);
      if (hit) {
        // Double-click text → edit.
        const now = Date.now();
        const prev = lastTextClick.current;
        if (
          hit.kind === "text" &&
          prev &&
          prev.id === hit.id &&
          now - prev.at < 400
        ) {
          lastTextClick.current = null;
          beginTextEdit({
            id: hit.id,
            layerId: hit.layerId,
            x: hit.x,
            y: hit.y,
            text: hit.text,
            color: hit.color,
            fontSize: hit.fontSize,
            rotation: hit.rotation,
            isNew: false,
            originalText: hit.text,
          });
          return;
        }
        if (hit.kind === "text") {
          lastTextClick.current = { id: hit.id, at: now };
        } else {
          lastTextClick.current = null;
        }

        let ids: string[];
        if (e.shiftKey) {
          const next = new Set(selectedIds);
          if (next.has(hit.id)) next.delete(hit.id);
          else next.add(hit.id);
          onSelectIds(next);
          ids = [...next];
        } else if (!selectedIds.has(hit.id)) {
          onSelectIds(new Set([hit.id]));
          ids = [hit.id];
        } else {
          ids = [...selectedIds];
        }
        const movableIds = ids.filter((id) =>
          selectable.some((o) => o.id === id),
        );
        if (movableIds.length > 0) {
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

      // Empty canvas → marquee or lasso (Shift keeps prior selection).
      if (!e.shiftKey) onSelectIds(new Set());
      if (selectMode === "lasso") {
        dragRef.current = {
          type: "lasso",
          points: [world],
          additive: e.shiftKey,
        };
        setLassoPoints([world]);
      } else {
        dragRef.current = {
          type: "marquee",
          start: world,
          current: world,
          additive: e.shiftKey,
        };
        setMarqueeRect({ x: world.x, y: world.y, w: 0, h: 0 });
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
    if (drag.type === "marquee") {
      drag.current = world;
      setMarqueeRect({
        x: Math.min(drag.start.x, world.x),
        y: Math.min(drag.start.y, world.y),
        w: Math.abs(world.x - drag.start.x),
        h: Math.abs(world.y - drag.start.y),
      });
      return;
    }
    if (drag.type === "lasso") {
      const last = drag.points[drag.points.length - 1];
      if (
        !last ||
        Math.hypot(world.x - last.x, world.y - last.y) >= 2 / viewport.zoom
      ) {
        drag.points.push(world);
        setLassoPoints([...drag.points]);
      }
      return;
    }
    if (drag.type === "scale") {
      const startHandle = scaleHandlePosition(drag.startBounds, drag.handle);
      const startDx = drag.startWorld.x - drag.origin.x;
      const startDy = drag.startWorld.y - drag.origin.y;
      const curDx = world.x - drag.origin.x;
      const curDy = world.y - drag.origin.y;
      let sx =
        Math.abs(startDx) < 1e-6 ? 1 : curDx / startDx;
      let sy =
        Math.abs(startDy) < 1e-6 ? 1 : curDy / startDy;
      if (drag.uniform || e.shiftKey) {
        const fromStart = Math.hypot(
          startHandle.x - drag.origin.x,
          startHandle.y - drag.origin.y,
        );
        const fromCur = Math.hypot(curDx, curDy);
        const s = fromStart < 1e-6 ? 1 : fromCur / fromStart;
        sx = s;
        sy = s;
      }
      sx = Math.max(0.05, Math.min(20, Math.abs(sx))) * Math.sign(sx || 1);
      sy = Math.max(0.05, Math.min(20, Math.abs(sy))) * Math.sign(sy || 1);
      const scaled = new Map(
        drag.originals.map((o) => [
          o.id,
          scaleObjectAround(o, drag.origin.x, drag.origin.y, sx, sy),
        ]),
      );
      setLiveObjects(
        objects.map((o) => (scaled.has(o.id) ? scaled.get(o.id)! : o)),
      );
      return;
    }
    if (drag.type === "rotate") {
      const angle = Math.atan2(
        world.y - drag.center.y,
        world.x - drag.center.x,
      );
      const delta = angle - drag.startAngle;
      const rotated = new Map(
        drag.originals.map((o) => [
          o.id,
          rotateObjectAround(o, drag.center.x, drag.center.y, delta),
        ]),
      );
      setLiveObjects(
        objects.map((o) => (rotated.has(o.id) ? rotated.get(o.id)! : o)),
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
      setMarqueeRect(null);
      setLassoPoints(null);
      return;
    }
    if (drag.type === "marquee") {
      const selectable = interactiveObjects(objects, layers);
      const rect: WorldBounds = {
        x: Math.min(drag.start.x, drag.current.x),
        y: Math.min(drag.start.y, drag.current.y),
        w: Math.abs(drag.current.x - drag.start.x),
        h: Math.abs(drag.current.y - drag.start.y),
      };
      const hits = objectsIntersectingRect(selectable, rect);
      if (drag.additive) {
        const next = new Set(selectedIds);
        for (const obj of hits) next.add(obj.id);
        onSelectIds(next);
      } else {
        onSelectIds(new Set(hits.map((o) => o.id)));
      }
      setMarqueeRect(null);
      return;
    }
    if (drag.type === "lasso") {
      const selectable = interactiveObjects(objects, layers);
      const hits = objectsInsideLasso(selectable, drag.points);
      if (drag.additive) {
        const next = new Set(selectedIds);
        for (const obj of hits) next.add(obj.id);
        onSelectIds(next);
      } else {
        onSelectIds(new Set(hits.map((o) => o.id)));
      }
      setLassoPoints(null);
      return;
    }
    if (drag.type === "scale" || drag.type === "rotate") {
      if (liveObjects) onCommitObjects(liveObjects);
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
          : tool === "text"
            ? "text"
            : "crosshair";

  const editSize = textEdit
    ? estimateTextSize({
        id: textEdit.id,
        kind: "text",
        layerId: textEdit.layerId,
        x: textEdit.x,
        y: textEdit.y,
        text: textEdit.text || " ",
        color: textEdit.color,
        fontSize: textEdit.fontSize,
        rotation: textEdit.rotation,
      })
    : null;

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
                    textEdit && textEdit.id === obj.id
                      ? null
                      : renderWhiteboardObject(obj, obj.id),
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
            const b = objectBounds(obj);
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
          {selectionBox && tool === "select" ? (
            <g className="whiteboard-selection-transform" pointerEvents="none">
              <rect
                x={selectionBox.x}
                y={selectionBox.y}
                width={Math.max(1, selectionBox.w)}
                height={Math.max(1, selectionBox.h)}
                fill="none"
                stroke="#2563EB"
                strokeWidth={1.25 / viewport.zoom}
              />
              <line
                x1={selectionBox.x + selectionBox.w / 2}
                y1={selectionBox.y}
                x2={rotateHandlePosition(selectionBox, viewport.zoom).x}
                y2={rotateHandlePosition(selectionBox, viewport.zoom).y}
                stroke="#2563EB"
                strokeWidth={1 / viewport.zoom}
              />
              <circle
                cx={rotateHandlePosition(selectionBox, viewport.zoom).x}
                cy={rotateHandlePosition(selectionBox, viewport.zoom).y}
                r={5 / viewport.zoom}
                fill="#F8FAFC"
                stroke="#2563EB"
                strokeWidth={1.25 / viewport.zoom}
              />
              {(["nw", "ne", "sw", "se"] as ScaleHandle[]).map((handle) => {
                const p = scaleHandlePosition(selectionBox, handle);
                const s = 7 / viewport.zoom;
                return (
                  <rect
                    key={handle}
                    x={p.x - s / 2}
                    y={p.y - s / 2}
                    width={s}
                    height={s}
                    fill="#F8FAFC"
                    stroke="#2563EB"
                    strokeWidth={1.25 / viewport.zoom}
                  />
                );
              })}
            </g>
          ) : null}
          {marqueeRect ? (
            <rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={Math.max(0, marqueeRect.w)}
              height={Math.max(0, marqueeRect.h)}
              fill="rgba(37, 99, 235, 0.12)"
              stroke="#2563EB"
              strokeWidth={1 / viewport.zoom}
              strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`}
              pointerEvents="none"
            />
          ) : null}
          {lassoPoints && lassoPoints.length > 0 ? (
            <polyline
              points={lassoPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="rgba(37, 99, 235, 0.08)"
              stroke="#2563EB"
              strokeWidth={1.25 / viewport.zoom}
              strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`}
              pointerEvents="none"
            />
          ) : null}
        </svg>
        {textEdit && editSize ? (
          <textarea
            ref={textAreaRef}
            className="whiteboard-text-editor"
            value={textEdit.text}
            aria-label="Edit canvas text"
            spellCheck={false}
            style={{
              left: textEdit.x,
              top: textEdit.y,
              width: Math.max(editSize.w + textEdit.fontSize, 80),
              minHeight: Math.max(editSize.h, textEdit.fontSize * 1.4),
              fontSize: textEdit.fontSize,
              color: textEdit.color,
              transform:
                textEdit.rotation !== undefined &&
                Math.abs(textEdit.rotation) > 1e-6
                  ? `rotate(${textEdit.rotation}rad)`
                  : undefined,
              transformOrigin: "top left",
            }}
            onChange={(ev) =>
              setTextEdit((prev) =>
                prev
                  ? {
                      ...prev,
                      text: ev.target.value.slice(0, MAX_TEXT_CHARS),
                    }
                  : prev,
              )
            }
            onPointerDown={(ev) => ev.stopPropagation()}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") {
                ev.preventDefault();
                finishTextEdit();
              }
              // Ctrl/Cmd+Enter commits; plain Enter inserts newline.
              if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                ev.preventDefault();
                finishTextEdit();
              }
            }}
          />
        ) : null}
      </div>
      <p className="muted tiny whiteboard-surface-hint" data-export-ignore>
        Space/Alt+drag or middle-mouse pan · wheel zoom · marquee/lasso select ·
        handles scale/rotate · Type tool for text · Delete removes · Ctrl/Cmd+D
        duplicates
      </p>
    </div>
  );
}
