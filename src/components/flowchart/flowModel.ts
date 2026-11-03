import { MarkerType, type Edge, type Node } from "@xyflow/react";

export type FlowNodeKind = "process" | "start" | "end" | "decision";
export type FlowNodeShape = "rectangle" | "rounded" | "diamond" | "ellipse";
export type FlowEdgePath = "curve" | "step";
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
  end: FlowEdgeEnd;
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
    kind: "process",
    label: "Process",
    defaultShape: "rounded",
    defaultFill: "#3d5a4c",
    defaultLabel: "Process",
  },
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
    kind: "decision",
    label: "Decision",
    defaultShape: "diamond",
    defaultFill: "#4a4f6d",
    defaultLabel: "Decision?",
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
  return { ...DEFAULT_NODE_SIZE };
}

export function markerForEnd(end: FlowEdgeEnd): Edge["markerEnd"] {
  switch (end) {
    case "arrow":
      return { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#c8c8c8" };
    case "diamond":
      return "url(#gdd-marker-diamond)";
    case "circle":
      return "url(#gdd-marker-circle)";
    default:
      return undefined;
  }
}

export function edgeTypeForPath(path: FlowEdgePath): string {
  return path === "step" ? "step" : "default";
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

type RawEdge = {
  id: string;
  source: string;
  target: string;
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
    ["process", "start", "end", "decision"].includes(String(data.kind))
      ? data.kind
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
  const path: FlowEdgePath =
    data.path === "step" || raw.type === "step" || raw.type === "smoothstep"
      ? "step"
      : "curve";
  let end: FlowEdgeEnd = "arrow";
  if (data.end === "none" || data.end === "arrow" || data.end === "diamond" || data.end === "circle") {
    end = data.end;
  } else if (!raw.markerEnd) {
    end = "arrow";
  }

  return {
    id: raw.id,
    source: raw.source,
    target: raw.target,
    label: raw.label,
    type: edgeTypeForPath(path),
    markerEnd: markerForEnd(end),
    data: { path, end },
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
  label?: string;
  type: string;
  data: FlowEdgeData;
} {
  const data = (edge.data as FlowEdgeData | undefined) ?? {
    path: edge.type === "step" ? "step" : "curve",
    end: edge.markerEnd ? "arrow" : "none",
  };
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === "string" ? edge.label : undefined,
    type: edgeTypeForPath(data.path),
    data: {
      path: data.path,
      end: data.end,
    },
  };
}
