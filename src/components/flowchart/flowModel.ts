import { MarkerType, type Edge, type Node } from "@xyflow/react";

/** UML-ish node kinds. `process` is the Action step (legacy id kept for saves). */
export type FlowNodeKind = "process" | "start" | "end" | "decision" | "state";
export type FlowNodeShape = "rectangle" | "rounded" | "diamond" | "ellipse";
export type FlowEdgePath = "curve" | "step";
/** @deprecated Legacy single-end style; migrated to startArrow/endArrow. */
export type FlowEdgeEnd = "none" | "arrow" | "diamond" | "circle";

export type FlowNodeData = {
  label: string;
  kind: FlowNodeKind;
  shape: FlowNodeShape;
  fill: string;
  onChangeLabel?: (id: string, label: string) => void;
};

export type FlowEdgeData = {
  path: FlowEdgePath;
  /** Arrow at the source (start) end of the connector. */
  startArrow: boolean;
  /** Arrow at the target (end) end of the connector. */
  endArrow: boolean;
};

export type FlowNode = Node<FlowNodeData, "flow">;
export type FlowEdge = Edge<FlowEdgeData>;

export const NODE_KIND_OPTIONS: Array<{
  kind: FlowNodeKind;
  label: string;
  defaultShape: FlowNodeShape;
  defaultFill: string;
  defaultLabel: string;
}> = [
  {
    kind: "start",
    label: "Start",
    defaultShape: "ellipse",
    defaultFill: "#3f6d4f",
    defaultLabel: "Start",
  },
  {
    kind: "end",
    label: "End",
    defaultShape: "ellipse",
    defaultFill: "#6d3f3f",
    defaultLabel: "End",
  },
  {
    kind: "process",
    label: "Action",
    defaultShape: "rounded",
    defaultFill: "#3d5a4c",
    defaultLabel: "Action",
  },
  {
    kind: "decision",
    label: "Decision",
    defaultShape: "diamond",
    defaultFill: "#4a4f6d",
    defaultLabel: "Decision?",
  },
  {
    kind: "state",
    label: "State",
    defaultShape: "rounded",
    defaultFill: "#3f5a6d",
    defaultLabel: "State",
  },
];

export const SHAPE_OPTIONS: FlowNodeShape[] = [
  "rectangle",
  "rounded",
  "diamond",
  "ellipse",
];

export const COLOR_PALETTE = [
  "#3d5a4c",
  "#3f6d4f",
  "#4a4f6d",
  "#6d3f3f",
  "#6d5a3f",
  "#3f5a6d",
  "#5a3f6d",
  "#2f2f2f",
  "#c4b59a",
  "#e8e8e8",
];

export const DEFAULT_NODE_SIZE = { width: 160, height: 64 };
export const DIAMOND_SIZE = { width: 140, height: 140 };

export function kindDefaults(kind: FlowNodeKind) {
  return (
    NODE_KIND_OPTIONS.find((k) => k.kind === kind) ?? NODE_KIND_OPTIONS[0]
  );
}

/** WCAG-ish relative luminance → pick light or dark ink. */
export function contrastInk(fill: string): string {
  const hex = fill.replace("#", "");
  if (hex.length !== 6) return "#f0f0f0";
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#1a1a1a" : "#f2f2f2";
}

export function defaultSizeFor(kind: FlowNodeKind, shape: FlowNodeShape) {
  if (kind === "decision" || shape === "diamond") return { ...DIAMOND_SIZE };
  if (kind === "start" || kind === "end" || shape === "ellipse") {
    return { width: 120, height: 72 };
  }
  if (kind === "state") {
    return { width: 150, height: 70 };
  }
  return { ...DEFAULT_NODE_SIZE };
}

/** Closed arrow marker used for start and/or end of a connector. */
export function markerForArrow(enabled: boolean): Edge["markerEnd"] {
  if (!enabled) return undefined;
  // Keep marker smaller than the perpendicular stub (~22px) so the
  // stub shaft stays visible (see desired-anchor-stubs.jpg).
  return {
    type: MarkerType.ArrowClosed,
    width: 12,
    height: 12,
    color: "#c8c8c8",
  };
}

/** @deprecated Prefer markerForArrow — kept for callers still passing FlowEdgeEnd. */
export function markerForEnd(end: FlowEdgeEnd): Edge["markerEnd"] {
  switch (end) {
    case "arrow":
      return markerForArrow(true);
    case "diamond":
      return "url(#gdd-marker-diamond)";
    case "circle":
      return "url(#gdd-marker-circle)";
    default:
      return undefined;
  }
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Resolve independent start/end arrow flags from saved edge data (incl. legacy `end`). */
export function resolveEdgeArrows(data: Record<string, unknown>, hasMarkerEnd?: boolean): {
  startArrow: boolean;
  endArrow: boolean;
} {
  if (typeof data.startArrow === "boolean" || typeof data.endArrow === "boolean") {
    return {
      startArrow: readBool(data.startArrow, false),
      endArrow: readBool(data.endArrow, true),
    };
  }
  // Legacy single-end style: none → no end arrow; anything else → end arrow on.
  if (data.end === "none") {
    return { startArrow: false, endArrow: false };
  }
  if (
    data.end === "arrow" ||
    data.end === "diamond" ||
    data.end === "circle"
  ) {
    return { startArrow: false, endArrow: true };
  }
  return { startArrow: false, endArrow: hasMarkerEnd !== false };
}

export function edgeTypeForPath(path: FlowEdgePath): string {
  // Custom edges draw a short perpendicular stub at each anchored handle.
  return path === "step" ? "stubStep" : "stubCurve";
}

type RawNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  style?: { width?: number | string; height?: number | string };
  data?: Record<string, unknown>;
};

const ANCHOR_SET = new Set(["top", "right", "bottom", "left"]);

function normalizeHandle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim().toLowerCase();
  return ANCHOR_SET.has(id) ? id : undefined;
}

type RawEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  data?: Record<string, unknown>;
  markerEnd?: unknown;
};

function num(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function migrateNode(raw: RawNode): Omit<FlowNode, "data"> & {
  data: Omit<FlowNodeData, "onChangeLabel">;
} {
  const data = raw.data ?? {};
  const kind = (
    ["process", "start", "end", "decision", "state", "action"].includes(
      String(data.kind),
    )
      ? data.kind === "action"
        ? "process"
        : data.kind
      : "process"
  ) as FlowNodeKind;
  const defaults = kindDefaults(kind);
  const shape = (
    SHAPE_OPTIONS.includes(data.shape as FlowNodeShape)
      ? data.shape
      : defaults.defaultShape
  ) as FlowNodeShape;
  const fill =
    typeof data.fill === "string" && data.fill.startsWith("#")
      ? data.fill
      : defaults.defaultFill;
  const size = defaultSizeFor(kind, shape);
  const width = num(
    data.width ?? raw.width ?? raw.style?.width,
    size.width,
  );
  const height = num(
    data.height ?? raw.height ?? raw.style?.height,
    size.height,
  );

  return {
    id: raw.id,
    type: "flow",
    position: raw.position,
    // Explicit dimensions so handle bounds (and edge endpoints) resolve to
    // the true N/E/S/W midpoints — not the node origin/corners.
    width,
    height,
    style: { width, height },
    data: {
      label: String(data.label ?? defaults.defaultLabel),
      kind,
      shape,
      fill,
    },
  };
}

export function migrateEdge(raw: RawEdge): FlowEdge {
  const data = raw.data ?? {};
  // Prefer angled (step) when legacy type is step/smoothstep; otherwise keep
  // curve unless path is explicitly step. New edges default to step in the editor.
  const path: FlowEdgePath =
    data.path === "step" ||
    data.path === "curve"
      ? (data.path as FlowEdgePath)
      : raw.type === "step" ||
          raw.type === "smoothstep" ||
          raw.type === "stubStep"
        ? "step"
        : "curve";
  const { startArrow, endArrow } = resolveEdgeArrows(
    data,
    Boolean(raw.markerEnd),
  );

  // Old graphs without handle ids get a stable default (right → left)
  // so edges still attach to explicit anchors after migration.
  const sourceHandle =
    normalizeHandle(raw.sourceHandle) ??
    normalizeHandle(data.sourceHandle) ??
    "right";
  const targetHandle =
    normalizeHandle(raw.targetHandle) ??
    normalizeHandle(data.targetHandle) ??
    "left";

  return {
    id: raw.id,
    source: raw.source,
    target: raw.target,
    sourceHandle,
    targetHandle,
    label: raw.label,
    type: edgeTypeForPath(path),
    markerStart: markerForArrow(startArrow),
    markerEnd: markerForArrow(endArrow),
    data: { path, startArrow, endArrow },
  };
}

export function serializeNode(node: Node): {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    kind: FlowNodeKind;
    shape: FlowNodeShape;
    fill: string;
    width: number;
    height: number;
  };
} {
  const data = node.data as FlowNodeData;
  const width = num(node.style?.width ?? node.width, DEFAULT_NODE_SIZE.width);
  const height = num(node.style?.height ?? node.height, DEFAULT_NODE_SIZE.height);
  return {
    id: node.id,
    type: "flow",
    position: node.position,
    data: {
      label: data.label,
      kind: data.kind,
      shape: data.shape,
      fill: data.fill,
      width,
      height,
    },
  };
}

export function serializeEdge(edge: Edge): {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type: string;
  data: FlowEdgeData;
} {
  const fallbackPath: FlowEdgePath =
    edge.type === "step" || edge.type === "stubStep" ? "step" : "curve";
  const rawData = (edge.data as Partial<FlowEdgeData> & { end?: FlowEdgeEnd } | undefined) ?? {};
  const arrows = resolveEdgeArrows(
    rawData as Record<string, unknown>,
    Boolean(edge.markerEnd),
  );
  const path = rawData.path === "step" || rawData.path === "curve"
    ? rawData.path
    : fallbackPath;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: normalizeHandle(edge.sourceHandle),
    targetHandle: normalizeHandle(edge.targetHandle),
    label: typeof edge.label === "string" ? edge.label : undefined,
    type: edgeTypeForPath(path),
    data: {
      path,
      startArrow: arrows.startArrow,
      endArrow: arrows.endArrow,
    },
  };
}
