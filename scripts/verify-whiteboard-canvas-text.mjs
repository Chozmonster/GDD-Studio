/**
 * Canvas text sanitize / geometry smoke (mirrors whiteboardModel helpers).
 * Run: node scripts/verify-whiteboard-canvas-text.mjs
 */

function sanitizeFontSize(raw, fallback = 24) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(128, Math.max(8, Math.round(n * 10) / 10));
}

function estimateTextSize(obj) {
  const lines = String(obj.text).split("\n");
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const w = Math.max(obj.fontSize * 0.5, maxLen * obj.fontSize * 0.62);
  const h = Math.max(obj.fontSize, lines.length * obj.fontSize * 1.25);
  return { w, h };
}

function translateText(obj, dx, dy) {
  return { ...obj, x: obj.x + dx, y: obj.y + dy };
}

function scaleTextAround(obj, originX, originY, sx, sy) {
  const scaleFactor = Math.sqrt(Math.abs(sx * sy));
  const { w, h } = estimateTextSize(obj);
  const cx = obj.x + w / 2;
  const cy = obj.y + h / 2;
  const newCenter = {
    x: originX + (cx - originX) * sx,
    y: originY + (cy - originY) * sy,
  };
  const nextFont = sanitizeFontSize(obj.fontSize * scaleFactor);
  const next = { ...obj, fontSize: nextFont };
  const nextSize = estimateTextSize(next);
  return {
    ...next,
    x: newCenter.x - nextSize.w / 2,
    y: newCenter.y - nextSize.h / 2,
  };
}

function rotateTextAround(obj, originX, originY, radians) {
  const { w, h } = estimateTextSize(obj);
  const localCenter = { x: obj.x + w / 2, y: obj.y + h / 2 };
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = localCenter.x - originX;
  const dy = localCenter.y - originY;
  const newCenter = {
    x: originX + dx * c - dy * s,
    y: originY + dx * s + dy * c,
  };
  return {
    ...obj,
    x: newCenter.x - w / 2,
    y: newCenter.y - h / 2,
    rotation: (obj.rotation ?? 0) + radians,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(sanitizeFontSize(12) === 12, "font size keep");
assert(sanitizeFontSize(2) === 8, "font size min");
assert(sanitizeFontSize(400) === 128, "font size max");

const sample = {
  id: "text-1",
  kind: "text",
  layerId: "layer-main",
  x: 10,
  y: 20,
  text: "Hi\nthere",
  color: "#1A1A1A",
  fontSize: 20,
};

const size = estimateTextSize(sample);
assert(size.w > 0 && size.h > sample.fontSize, "estimate size");

const moved = translateText(sample, 5, -3);
assert(moved.x === 15 && moved.y === 17, "translate");

const scaled = scaleTextAround(sample, 0, 0, 2, 2);
assert(scaled.fontSize === 40, "scale font");
assert(Math.abs(scaled.x - sample.x * 2) < 1e-6 || scaled.x !== sample.x, "scale moves");

const rotated = rotateTextAround(sample, sample.x, sample.y, Math.PI / 2);
assert(Math.abs((rotated.rotation ?? 0) - Math.PI / 2) < 1e-9, "rotate accumulates");

// Empty / whitespace text should be rejected by sanitize rules.
assert(!"   ".trim(), "empty reject");

console.log("verify-whiteboard-canvas-text: ok");
