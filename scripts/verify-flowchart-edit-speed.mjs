/**
 * Smoke-test flowchart clipboard / align / quick-add helpers (no build step).
 * Run: node scripts/verify-flowchart-edit-speed.mjs
 *
 * Mirrors the pure logic in flowClipboard / flowAlign / flowQuickAdd so CI can
 * catch regressions without a Vite/TS harness.
 */
import assert from "node:assert/strict";

const GRID = 20;

function snap(n, grid = GRID) {
  return Math.round(n / grid) * grid;
}

function nodeBox(node) {
  const width = Number(node.style?.width ?? node.width ?? 160);
  const height = Number(node.style?.height ?? node.height ?? 64);
  return {
    x: node.position.x,
    y: node.position.y,
    width: Number.isFinite(width) ? width : 160,
    height: Number.isFinite(height) ? height : 64,
  };
}

function extractClipboardSelection(nodes, edges, selectedNodeIds) {
  const nodeIdSet = new Set(selectedNodeIds);
  if (nodeIdSet.size === 0) return null;
  const clippedNodes = nodes.filter((n) => nodeIdSet.has(n.id));
  if (clippedNodes.length === 0) return null;
  const clippedEdges = edges.filter(
    (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target),
  );
  return { nodes: clippedNodes, edges: clippedEdges };
}

function cloneClipboardPayload(payload, nextNodeId, nextEdgeId, offset = { x: 40, y: 40 }) {
  const nodeIdMap = new Map();
  const nodes = payload.nodes.map((n) => {
    const id = nextNodeId();
    nodeIdMap.set(n.id, id);
    return {
      ...n,
      id,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      selected: true,
    };
  });
  const edges = payload.edges
    .map((e) => {
      const source = nodeIdMap.get(e.source);
      const target = nodeIdMap.get(e.target);
      if (!source || !target) return null;
      return { ...e, id: nextEdgeId(), source, target };
    })
    .filter(Boolean);
  return { nodes, edges, nodeIdMap };
}

function alignNodePositions(nodes, mode) {
  const result = new Map();
  if (nodes.length < 2) return result;
  const boxes = nodes.map((n) => ({ id: n.id, box: nodeBox(n) }));
  if (mode === "left") {
    const anchor = Math.min(...boxes.map((b) => b.box.x));
    for (const { id, box } of boxes) result.set(id, { x: anchor, y: box.y });
  } else if (mode === "center") {
    const minL = Math.min(...boxes.map((b) => b.box.x));
    const maxR = Math.max(...boxes.map((b) => b.box.x + b.box.width));
    const anchor = (minL + maxR) / 2;
    for (const { id, box } of boxes) {
      result.set(id, { x: snap(anchor - box.width / 2), y: box.y });
    }
  }
  return result;
}

function distributeNodePositions(nodes, axis) {
  const result = new Map();
  if (nodes.length < 3) return result;
  const boxes = nodes.map((n) => ({ id: n.id, box: nodeBox(n) }));
  if (axis === "horizontal") {
    boxes.sort((a, b) => a.box.x - b.box.x);
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const totalWidth = boxes.reduce((s, b) => s + b.box.width, 0);
    const span = last.x + last.width - first.x;
    const gap = (span - totalWidth) / (boxes.length - 1);
    let cursor = first.x;
    for (let i = 0; i < boxes.length; i++) {
      const { id, box } = boxes[i];
      const x = i === 0 || i === boxes.length - 1 ? box.x : snap(cursor);
      result.set(id, { x, y: box.y });
      cursor = (i === 0 ? box.x : x) + box.width + gap;
    }
  }
  return result;
}

function oppositeAnchor(anchor) {
  return { top: "bottom", right: "left", bottom: "top", left: "right" }[anchor];
}

function quickAddPosition(source, anchor, size, gap = 80) {
  const midX = source.x + source.width / 2 - size.width / 2;
  const midY = source.y + source.height / 2 - size.height / 2;
  if (anchor === "right") {
    return { x: snap(source.x + source.width + gap), y: snap(midY) };
  }
  if (anchor === "bottom") {
    return { x: snap(midX), y: snap(source.y + source.height + gap) };
  }
  throw new Error(`unexpected ${anchor}`);
}

// --- clipboard ---
const nodes = [
  { id: "n-1", position: { x: 0, y: 0 }, width: 100, height: 40, data: {} },
  { id: "n-2", position: { x: 200, y: 0 }, width: 100, height: 40, data: {} },
  { id: "n-3", position: { x: 400, y: 0 }, width: 100, height: 40, data: {} },
];
const edges = [
  { id: "e-1", source: "n-1", target: "n-2" },
  { id: "e-2", source: "n-2", target: "n-3" },
];
const clip = extractClipboardSelection(nodes, edges, ["n-1", "n-2"]);
assert.equal(clip.nodes.length, 2);
assert.equal(clip.edges.length, 1);
assert.equal(clip.edges[0].id, "e-1");
assert.equal(extractClipboardSelection(nodes, edges, []), null);

let counter = 10;
const cloned = cloneClipboardPayload(
  clip,
  () => `n-${counter++}`,
  () => `e-${counter++}`,
);
assert.equal(cloned.nodes.length, 2);
assert.equal(cloned.edges.length, 1);
assert.equal(cloned.nodes[0].id, "n-10");
assert.equal(cloned.nodes[0].position.x, 40);
assert.equal(cloned.edges[0].source, "n-10");
assert.equal(cloned.edges[0].target, "n-11");
assert.notEqual(cloned.edges[0].id, "e-1");

// --- align / distribute ---
const aligned = alignNodePositions(
  [
    { id: "a", position: { x: 10, y: 0 }, width: 100, height: 40 },
    { id: "b", position: { x: 80, y: 50 }, width: 100, height: 40 },
  ],
  "left",
);
assert.equal(aligned.get("a").x, 10);
assert.equal(aligned.get("b").x, 10);
assert.equal(aligned.get("b").y, 50);

const leftExact = alignNodePositions(
  [
    { id: "a", position: { x: 40, y: 0 }, width: 100, height: 40 },
    { id: "b", position: { x: 120, y: 50 }, width: 80, height: 40 },
  ],
  "left",
);
assert.equal(leftExact.get("a").x, 40);
assert.equal(leftExact.get("b").x, 40);

const centered = alignNodePositions(
  [
    { id: "a", position: { x: 0, y: 0 }, width: 100, height: 40 },
    { id: "b", position: { x: 200, y: 0 }, width: 100, height: 40 },
  ],
  "center",
);
// span 0..300, center 150, each width 100 → x=100
assert.equal(centered.get("a").x, 100);
assert.equal(centered.get("b").x, 100);

const distributed = distributeNodePositions(
  [
    { id: "a", position: { x: 0, y: 0 }, width: 100, height: 40 },
    { id: "b", position: { x: 120, y: 0 }, width: 100, height: 40 },
    { id: "c", position: { x: 400, y: 0 }, width: 100, height: 40 },
  ],
  "horizontal",
);
assert.equal(distributed.get("a").x, 0);
assert.equal(distributed.get("c").x, 400);
// span=500, totalWidth=300, gap=100 → b at 0+100+100=200
assert.equal(distributed.get("b").x, 200);
assert.equal(distributeNodePositions(nodes.slice(0, 2), "horizontal").size, 0);

// --- quick-add ---
assert.equal(oppositeAnchor("right"), "left");
assert.equal(oppositeAnchor("top"), "bottom");
const pos = quickAddPosition(
  { x: 0, y: 0, width: 160, height: 64 },
  "right",
  { width: 160, height: 64 },
);
assert.equal(pos.x, 240); // 160+80
assert.equal(pos.y, 0);
const posB = quickAddPosition(
  { x: 0, y: 0, width: 160, height: 64 },
  "bottom",
  { width: 160, height: 64 },
);
assert.equal(posB.x, 0);
assert.equal(posB.y, 140); // 64+80

console.log("flowchart-edit-speed ok");
