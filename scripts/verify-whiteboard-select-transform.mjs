/**
 * Select/transform helper smoke (mirrors whiteboardModel geometry helpers).
 * Run: node scripts/verify-whiteboard-select-transform.mjs
 */

function boundsIntersect(a, b) {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

function pointInPolygon(x, y, poly) {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function scaleAround(x, y, ox, oy, sx, sy) {
  return { x: ox + (x - ox) * sx, y: oy + (y - oy) * sy };
}

function rotateAround(x, y, ox, oy, radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = x - ox;
  const dy = y - oy;
  return { x: ox + dx * c - dy * s, y: oy + dx * s + dy * c };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  boundsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
  "intersect",
);
assert(
  !boundsIntersect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 2, h: 2 }),
  "no intersect",
);

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
assert(pointInPolygon(5, 5, square), "inside lasso");
assert(!pointInPolygon(20, 20, square), "outside lasso");

const scaled = scaleAround(10, 10, 0, 0, 2, 2);
assert(scaled.x === 20 && scaled.y === 20, "scale");

const rotated = rotateAround(1, 0, 0, 0, Math.PI / 2);
assert(Math.abs(rotated.x) < 1e-9 && Math.abs(rotated.y - 1) < 1e-9, "rotate");

console.log("verify-whiteboard-select-transform: ok");
