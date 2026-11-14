/**
 * Migration + layer helpers smoke (no React/build required).
 * Run: node scripts/verify-whiteboard-layers.mjs
 *
 * Mirrors the normalize / layer mutation rules in whiteboardModel.ts.
 */

const MAX_LAYERS = 32;
const MAX_LAYER_NAME = 64;
const DEFAULT_LAYER_NAME = "Layer 1";

function newEntityId(prefix) {
  return `${prefix}-test${Math.floor(Math.random() * 1e6)}`;
}

function createWhiteboardLayer(name = DEFAULT_LAYER_NAME, id) {
  return {
    id: id ?? newEntityId("layer"),
    name: String(name).trim().slice(0, MAX_LAYER_NAME) || DEFAULT_LAYER_NAME,
    visible: true,
    locked: false,
    opacity: 1,
  };
}

function sanitizeOpacity(raw) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function sanitizeLayer(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id || id.length > 64) return null;
  const name =
    String(raw.name ?? "")
      .trim()
      .slice(0, MAX_LAYER_NAME) || `Layer ${index + 1}`;
  return {
    id,
    name,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    opacity: sanitizeOpacity(raw.opacity),
  };
}

function normalizeWhiteboard(doc) {
  const rawLayers = Array.isArray(doc.layers) ? doc.layers : [];
  const layers = [];
  const seen = new Set();
  for (let i = 0; i < rawLayers.length; i++) {
    const next = sanitizeLayer(rawLayers[i], i);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    layers.push(next);
    if (layers.length >= MAX_LAYERS) break;
  }
  if (layers.length === 0) layers.push(createWhiteboardLayer(DEFAULT_LAYER_NAME));

  const fallbackLayerId = layers[0].id;
  const layerIds = new Set(layers.map((l) => l.id));
  let activeLayerId = String(doc.activeLayerId ?? "").trim();
  if (!layerIds.has(activeLayerId)) activeLayerId = fallbackLayerId;

  const objects = [];
  const rawObjects = Array.isArray(doc.objects) ? doc.objects : [];
  for (let i = 0; i < rawObjects.length; i++) {
    const raw = rawObjects[i];
    if (!raw || typeof raw !== "object") continue;
    const layerId = String(raw.layerId || "").trim() || fallbackLayerId;
    objects.push({
      ...raw,
      layerId: layerIds.has(layerId) ? layerId : fallbackLayerId,
    });
  }

  return {
    format: "gdd-studio-whiteboard",
    version: 2,
    id: doc.id || "main",
    name: doc.name || "Main",
    description: String(doc.description ?? ""),
    layers,
    activeLayerId,
    objects,
    viewport: doc.viewport ?? { x: 0, y: 0, zoom: 1 },
    paletteRef: doc.paletteRef ?? null,
  };
}

function removeWhiteboardLayer(doc, layerId) {
  if (doc.layers.length <= 1) return doc;
  const index = doc.layers.findIndex((l) => l.id === layerId);
  if (index < 0) return doc;
  const fallback = doc.layers[index - 1] ?? doc.layers[index + 1] ?? doc.layers[0];
  const layers = doc.layers.filter((l) => l.id !== layerId);
  const objects = doc.objects.map((o) =>
    o.layerId === layerId ? { ...o, layerId: fallback.id } : o,
  );
  const activeLayerId =
    doc.activeLayerId === layerId ? fallback.id : doc.activeLayerId;
  return { ...doc, layers, objects, activeLayerId };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Legacy v1 board (no layers / layerId) migrates safely.
const legacy = normalizeWhiteboard({
  format: "gdd-studio-whiteboard",
  version: 1,
  id: "main",
  name: "Main",
  description: "",
  objects: [
    {
      id: "path-1",
      kind: "path",
      mode: "pen",
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: "#1A1A1A",
      width: 3,
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
});
assert(legacy.version === 2, "migrates to version 2");
assert(legacy.layers.length === 1, "creates default layer");
assert(legacy.objects[0].layerId === legacy.layers[0].id, "attaches legacy ink");
assert(legacy.activeLayerId === legacy.layers[0].id, "active = default");

// Orphan layerId remaps to fallback.
const remapped = normalizeWhiteboard({
  ...legacy,
  objects: [{ ...legacy.objects[0], layerId: "missing-layer" }],
});
assert(
  remapped.objects[0].layerId === remapped.layers[0].id,
  "orphan layerId remaps",
);

// Delete moves ink to neighbor; cannot delete last layer.
const two = normalizeWhiteboard({
  ...legacy,
  layers: [
    createWhiteboardLayer("Bottom", "layer-a"),
    createWhiteboardLayer("Top", "layer-b"),
  ],
  activeLayerId: "layer-b",
  objects: [
    { id: "a", kind: "line", layerId: "layer-a", x1: 0, y1: 0, x2: 1, y2: 1, color: "#000", width: 2 },
    { id: "b", kind: "line", layerId: "layer-b", x1: 0, y1: 0, x2: 1, y2: 1, color: "#000", width: 2 },
  ],
});
const afterDelete = removeWhiteboardLayer(two, "layer-b");
assert(afterDelete.layers.length === 1, "deleted one layer");
assert(afterDelete.objects.every((o) => o.layerId === "layer-a"), "ink moved");
assert(afterDelete.activeLayerId === "layer-a", "active moved");
assert(
  removeWhiteboardLayer(afterDelete, "layer-a") === afterDelete,
  "keeps last layer",
);

console.log("verify-whiteboard-layers: ok");
