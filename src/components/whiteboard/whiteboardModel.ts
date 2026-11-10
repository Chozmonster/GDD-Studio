import type {
  WhiteboardDocument,
  WhiteboardObject,
  WhiteboardPaletteRef,
  WhiteboardPathObject,
  WhiteboardPoint,
  WhiteboardShapeObject,
  WhiteboardViewport,
} from "../../types";

export const DEFAULT_STROKE_COLOR = "#1A1A1A";
export const DEFAULT_STROKE_WIDTH = 3;
export const FALLBACK_SWATCHES = [
  "#1A1A1A",
  "#C0392B",
  "#2980B9",
  "#27AE60",
  "#F39C12",
  "#8E44AD",
  "#FFFFFF",
] as const;

const MAX_OBJECTS = 2_000;
const MAX_PATH_POINTS = 4_000;
const MAX_DESCRIPTION = 2_000;

export function emptyWhiteboardDocument(
  id = "main",
  name = "Main",
): WhiteboardDocument {
  return {
    format: "gdd-studio-whiteboard",
    version: 1,
    id,
    name: name || (id === "main" ? "Main" : id),
    description: "",
    objects: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    paletteRef: null,
  };
}

export function cloneWhiteboard(doc: WhiteboardDocument): WhiteboardDocument {
  return structuredClone(doc);
}

export function newEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(4, Math.max(0.25, zoom));
}

function sanitizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t || t.length > 32) return fallback;
  if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(t)) return t.toUpperCase();
  if (
    t.startsWith("rgb(") ||
    t.startsWith("rgba(") ||
    /^[a-zA-Z-]+$/.test(t)
  ) {
    return t;
  }
  return fallback;
}

function sanitizeWidth(raw: unknown, fallback = DEFAULT_STROKE_WIDTH): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(48, Math.max(1, Math.round(n * 10) / 10));
}

/** Clamp Pointer Events pressure; missing/invalid → 0.5 (mouse/fallback). */
export function sanitizePressure(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/**
 * Map pressure → width factor around the brush size.
 * Pointer Events mouse reports 0.5 → factor 1 (constant brush width).
 * Pen varies ~0.5×–1.5× of the current brush — natural, not extreme.
 */
export function pressureWidthFactor(pressure: number | undefined): number {
  return 0.5 + sanitizePressure(pressure);
}

export function pointStrokeWidth(
  baseWidth: number,
  pressure: number | undefined,
): number {
  return Math.max(0.5, baseWidth * pressureWidthFactor(pressure));
}

/** True when any point stores pressure that would vary stroke width. */
export function pathHasVariableWidth(points: WhiteboardPoint[]): boolean {
  let seen: number | null = null;
  for (const p of points) {
    if (p.pressure === undefined) continue;
    const f = pressureWidthFactor(p.pressure);
    if (seen === null) seen = f;
    else if (Math.abs(f - seen) > 0.02) return true;
  }
  return false;
}

export function pathMaxStrokeWidth(
  points: WhiteboardPoint[],
  baseWidth: number,
): number {
  let max = baseWidth;
  for (const p of points) {
    if (p.pressure === undefined) continue;
    max = Math.max(max, pointStrokeWidth(baseWidth, p.pressure));
  }
  return max;
}

function sanitizePoint(p: unknown): WhiteboardPoint | null {
  if (!p || typeof p !== "object") return null;
  const x = Number((p as WhiteboardPoint).x);
  const y = Number((p as WhiteboardPoint).y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const out: WhiteboardPoint = { x, y };
  if ((p as WhiteboardPoint).pressure !== undefined) {
    out.pressure = sanitizePressure((p as WhiteboardPoint).pressure);
  }
  return out;
}

function sanitizePath(obj: Partial<WhiteboardPathObject>, index: number): WhiteboardPathObject | null {
  const id = String(obj.id || `path-${index + 1}`);
  const pointsRaw = Array.isArray(obj.points) ? obj.points : [];
  const points: WhiteboardPoint[] = [];
  for (const p of pointsRaw) {
    const pt = sanitizePoint(p);
    if (pt) points.push(pt);
    if (points.length >= MAX_PATH_POINTS) break;
  }
  if (points.length < 1) return null;
  return {
    id,
    kind: "path",
    mode: obj.mode === "eraser" ? "eraser" : "pen",
    points,
    color: sanitizeColor(obj.color, DEFAULT_STROKE_COLOR),
    width: sanitizeWidth(obj.width),
  };
}

function sanitizeShape(
  obj: Partial<WhiteboardShapeObject>,
  index: number,
): WhiteboardShapeObject | null {
  const kind = obj.kind;
  if (kind !== "line" && kind !== "rect" && kind !== "ellipse") return null;
  const x1 = Number(obj.x1);
  const y1 = Number(obj.y1);
  const x2 = Number(obj.x2);
  const y2 = Number(obj.y2);
  if (
    ![x1, y1, x2, y2].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  const fillRaw = obj.fill;
  const fill =
    fillRaw === null || fillRaw === undefined || fillRaw === ""
      ? null
      : sanitizeColor(fillRaw, DEFAULT_STROKE_COLOR);
  return {
    id: String(obj.id || `shape-${index + 1}`),
    kind,
    x1,
    y1,
    x2,
    y2,
    color: sanitizeColor(obj.color, DEFAULT_STROKE_COLOR),
    width: sanitizeWidth(obj.width),
    fill,
  };
}

function sanitizeObject(raw: unknown, index: number): WhiteboardObject | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = (raw as WhiteboardObject).kind;
  if (kind === "path") return sanitizePath(raw as WhiteboardPathObject, index);
  return sanitizeShape(raw as WhiteboardShapeObject, index);
}

function sanitizeViewport(raw: unknown): WhiteboardViewport {
  if (!raw || typeof raw !== "object") return { x: 0, y: 0, zoom: 1 };
  const v = raw as WhiteboardViewport;
  const x = Number(v.x);
  const y = Number(v.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    zoom: clampZoom(Number(v.zoom)),
  };
}

function sanitizePaletteRef(raw: unknown): WhiteboardPaletteRef | null {
  if (!raw || typeof raw !== "object") return null;
  const moodBoardId = String(
    (raw as WhiteboardPaletteRef).moodBoardId ?? "",
  ).trim();
  const itemId = String((raw as WhiteboardPaletteRef).itemId ?? "").trim();
  if (!moodBoardId || !itemId) return null;
  return { moodBoardId, itemId };
}

export function normalizeWhiteboard(doc: WhiteboardDocument): WhiteboardDocument {
  const objects: WhiteboardObject[] = [];
  const rawObjects = Array.isArray(doc.objects) ? doc.objects : [];
  for (let i = 0; i < rawObjects.length; i++) {
    const next = sanitizeObject(rawObjects[i], i);
    if (next) objects.push(next);
    if (objects.length >= MAX_OBJECTS) break;
  }

  return {
    format: "gdd-studio-whiteboard",
    version: 1,
    id: doc.id || "main",
    name:
      doc.name?.trim() ||
      (doc.id === "main" ? "Main" : doc.id || "Untitled"),
    description: String(doc.description ?? "")
      .trim()
      .slice(0, MAX_DESCRIPTION),
    objects,
    viewport: sanitizeViewport(doc.viewport),
    paletteRef: sanitizePaletteRef(doc.paletteRef),
  };
}

export function pathToSvgD(points: WhiteboardPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) {
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}

/**
 * Filled outline for a freehand stroke with per-point width from pressure.
 * Round caps via end circles; joints via averaged segment normals.
 */
export function pathToVariableWidthOutline(
  points: WhiteboardPoint[],
  baseWidth: number,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const r = pointStrokeWidth(baseWidth, points[0].pressure) / 2;
    const { x, y } = points[0];
    return circlePath(x, y, r);
  }

  const left: WhiteboardPoint[] = [];
  const right: WhiteboardPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const prev = points[i - 1] ?? curr;
    const next = points[i + 1] ?? curr;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    const nx = -dy;
    const ny = dx;
    const hw = pointStrokeWidth(baseWidth, curr.pressure) / 2;
    left.push({ x: curr.x + nx * hw, y: curr.y + ny * hw });
    right.push({ x: curr.x - nx * hw, y: curr.y - ny * hw });
  }

  let d = `M ${left[0].x} ${left[0].y}`;
  for (let i = 1; i < left.length; i++) {
    d += ` L ${left[i].x} ${left[i].y}`;
  }
  for (let i = right.length - 1; i >= 0; i--) {
    d += ` L ${right[i].x} ${right[i].y}`;
  }
  d += " Z";

  // Round caps at ends (and soft joints) so thin→thick transitions stay ink-like.
  const startR = pointStrokeWidth(baseWidth, points[0].pressure) / 2;
  const endR =
    pointStrokeWidth(baseWidth, points[points.length - 1].pressure) / 2;
  d += ` ${circlePath(points[0].x, points[0].y, startR)}`;
  d += ` ${circlePath(points[points.length - 1].x, points[points.length - 1].y, endR)}`;
  return d;
}

function circlePath(x: number, y: number, r: number): string {
  const rr = Math.max(0.25, r);
  return `M ${x - rr} ${y} a ${rr} ${rr} 0 1 0 ${rr * 2} 0 a ${rr} ${rr} 0 1 0 ${-rr * 2} 0 Z`;
}

export function shapeBounds(obj: WhiteboardShapeObject): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const x = Math.min(obj.x1, obj.x2);
  const y = Math.min(obj.y1, obj.y2);
  const w = Math.abs(obj.x2 - obj.x1);
  const h = Math.abs(obj.y2 - obj.y1);
  return { x, y, w, h };
}

export function objectBounds(obj: WhiteboardObject): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (obj.kind === "path") {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of obj.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = pathMaxStrokeWidth(obj.points, obj.width) / 2;
    return {
      x: minX - pad,
      y: minY - pad,
      w: Math.max(0, maxX - minX) + pad * 2,
      h: Math.max(0, maxY - minY) + pad * 2,
    };
  }
  const b = shapeBounds(obj);
  const pad = obj.width / 2;
  return {
    x: b.x - pad,
    y: b.y - pad,
    w: b.w + pad * 2,
    h: b.h + pad * 2,
  };
}

/** Content bounds for fitting embeds (empty board → default paper). */
export function contentBounds(
  objects: WhiteboardObject[],
): { x: number; y: number; w: number; h: number } {
  if (objects.length === 0) {
    return { x: 0, y: 0, w: 640, h: 400 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    const b = objectBounds(obj);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const pad = 24;
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(80, maxX - minX + pad * 2),
    h: Math.max(80, maxY - minY + pad * 2),
  };
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.sqrt(dist2(px, py, ax, ay));
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(dist2(px, py, ax + t * abx, ay + t * aby));
}

export function hitTestObject(
  obj: WhiteboardObject,
  x: number,
  y: number,
  threshold = 6,
): boolean {
  if (obj.kind === "path") {
    const pts = obj.points;
    for (let i = 1; i < pts.length; i++) {
      const w =
        (pointStrokeWidth(obj.width, pts[i - 1].pressure) +
          pointStrokeWidth(obj.width, pts[i].pressure)) /
        2;
      const tol = Math.max(threshold, w / 2 + 2);
      if (
        distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <=
        tol
      ) {
        return true;
      }
    }
    if (pts.length === 1) {
      const tol = Math.max(
        threshold,
        pointStrokeWidth(obj.width, pts[0].pressure) / 2 + 2,
      );
      return Math.sqrt(dist2(x, y, pts[0].x, pts[0].y)) <= tol;
    }
    return false;
  }
  if (obj.kind === "line") {
    const tol = Math.max(threshold, obj.width / 2 + 2);
    return distToSegment(x, y, obj.x1, obj.y1, obj.x2, obj.y2) <= tol;
  }
  const b = shapeBounds(obj);
  if (obj.kind === "rect") {
    if (obj.fill) {
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    }
    const tol = Math.max(threshold, obj.width / 2 + 2);
    const inside =
      x >= b.x - tol &&
      x <= b.x + b.w + tol &&
      y >= b.y - tol &&
      y <= b.y + b.h + tol;
    const deepInside =
      x >= b.x + tol &&
      x <= b.x + b.w - tol &&
      y >= b.y + tol &&
      y <= b.y + b.h - tol;
    return inside && !deepInside;
  }
  // ellipse
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = Math.max(1, b.w / 2);
  const ry = Math.max(1, b.h / 2);
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const r2 = nx * nx + ny * ny;
  if (obj.fill) return r2 <= 1;
  const tol = Math.max(threshold, obj.width / 2 + 2) / Math.min(rx, ry);
  return r2 <= 1 + tol && r2 >= 1 - tol;
}

/** Topmost object under point (later objects paint above). */
export function hitTestTop(
  objects: WhiteboardObject[],
  x: number,
  y: number,
): WhiteboardObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitTestObject(objects[i], x, y)) return objects[i];
  }
  return null;
}

export function translateObject(
  obj: WhiteboardObject,
  dx: number,
  dy: number,
): WhiteboardObject {
  if (obj.kind === "path") {
    return {
      ...obj,
      points: obj.points.map((p) => ({
        x: p.x + dx,
        y: p.y + dy,
        ...(p.pressure !== undefined ? { pressure: p.pressure } : {}),
      })),
    };
  }
  return {
    ...obj,
    x1: obj.x1 + dx,
    y1: obj.y1 + dy,
    x2: obj.x2 + dx,
    y2: obj.y2 + dy,
  };
}

export function objectsIntersectBrush(
  obj: WhiteboardObject,
  x: number,
  y: number,
  radius: number,
): boolean {
  return hitTestObject(obj, x, y, radius);
}
