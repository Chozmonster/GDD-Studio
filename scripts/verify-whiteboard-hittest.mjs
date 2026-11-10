/**
 * Pure-JS port of whiteboard hit-test invariants (no React/build required).
 * Run: node scripts/verify-whiteboard-hittest.mjs
 */

function shapeBounds(obj) {
  const x = Math.min(obj.x1, obj.x2);
  const y = Math.min(obj.y1, obj.y2);
  const w = Math.abs(obj.x2 - obj.x1);
  const h = Math.abs(obj.y2 - obj.y1);
  return { x, y, w, h };
}

function distToSolidRect(px, py, x, y, w, h) {
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  return Math.hypot(dx, dy);
}

function distToSolidEllipse(px, py, cx, cy, rx, ry) {
  const safeRx = Math.max(1e-6, rx);
  const safeRy = Math.max(1e-6, ry);
  const nx = (px - cx) / safeRx;
  const ny = (py - cy) / safeRy;
  const r = Math.hypot(nx, ny);
  if (r <= 1) return 0;
  return (r - 1) * Math.min(safeRx, safeRy);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

function hitTestObject(obj, x, y, threshold = 6) {
  const pad = Math.max(0, threshold);
  if (obj.kind === "line") {
    return distToSegment(x, y, obj.x1, obj.y1, obj.x2, obj.y2) <= obj.width / 2 + pad;
  }
  const b = shapeBounds(obj);
  const strokePad = obj.width / 2 + pad;
  if (obj.kind === "rect") {
    return distToSolidRect(x, y, b.x, b.y, b.w, b.h) <= strokePad;
  }
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = Math.max(0.5, b.w / 2);
  const ry = Math.max(0.5, b.h / 2);
  return distToSolidEllipse(x, y, cx, cy, rx, ry) <= strokePad;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const hollowRect = {
  kind: "rect",
  x1: 0,
  y1: 0,
  x2: 200,
  y2: 100,
  width: 3,
  fill: null,
  color: "#000",
};
const filledRect = { ...hollowRect, fill: "#C0392B" };
const hollowEllipse = {
  kind: "ellipse",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 60,
  width: 3,
  fill: null,
  color: "#000",
};
const line = {
  kind: "line",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  width: 4,
  fill: null,
  color: "#000",
};

// Hollow rect: center must erase (old ring-only logic failed here).
assert(hitTestObject(hollowRect, 100, 50, 4), "hollow rect center");
assert(hitTestObject(hollowRect, 0, 0, 4), "hollow rect corner");
assert(!hitTestObject(hollowRect, 400, 400, 4), "hollow rect far miss");

// Filled rect: exterior stroke (width 3 → half 1.5) and brush radius must hit.
assert(hitTestObject(filledRect, -1.5, 50, 0), "filled rect exterior stroke");
assert(hitTestObject(filledRect, -5, 50, 4), "filled rect brush radius");
assert(!hitTestObject(filledRect, -5, 50, 0), "filled rect outside without brush");

// Hollow ellipse interior.
assert(hitTestObject(hollowEllipse, 50, 30, 4), "hollow ellipse center");
assert(!hitTestObject(hollowEllipse, 200, 200, 4), "hollow ellipse miss");

// Line near miss / hit.
assert(hitTestObject(line, 50, 0, 2), "line on stroke");
assert(hitTestObject(line, 50, 3, 2), "line within brush");
assert(!hitTestObject(line, 50, 20, 2), "line far miss");

console.log("verify-whiteboard-hittest: ok");
