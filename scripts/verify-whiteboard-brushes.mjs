/**
 * Brush alpha / sanitize smoke (mirrors whiteboardModel helpers).
 * Run: node scripts/verify-whiteboard-brushes.mjs
 */

function sanitizeStrokeAlpha(raw, fallback = 1) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0.05, Math.round(n * 100) / 100));
}

function sanitizeBrush(raw) {
  if (raw === "soft" || raw === "highlighter" || raw === "hard") return raw;
  return "hard";
}

function pathStrokeAlpha(obj) {
  const opacity = obj.opacity ?? 1;
  const flow = obj.flow ?? 1;
  return Math.min(1, Math.max(0, opacity * flow));
}

function softBrushBlur(width) {
  const w = Math.min(48, Math.max(1, Math.round(width * 10) / 10));
  return Math.max(0.75, w * 0.45);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(sanitizeBrush("soft") === "soft", "soft brush");
assert(sanitizeBrush("highlighter") === "highlighter", "highlighter");
assert(sanitizeBrush("nope") === "hard", "fallback hard");
assert(sanitizeStrokeAlpha(0) === 0.05, "alpha floor");
assert(sanitizeStrokeAlpha(1.5) === 1, "alpha ceil");
assert(Math.abs(pathStrokeAlpha({ opacity: 0.4, flow: 0.5 }) - 0.2) < 1e-9, "opacity×flow");
assert(pathStrokeAlpha({}) === 1, "defaults opaque");
assert(softBrushBlur(3) > 1, "soft blur scales");

console.log("verify-whiteboard-brushes: ok");
