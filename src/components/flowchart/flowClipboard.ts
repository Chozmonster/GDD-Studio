import type { FlowEdge, FlowNode } from "./flowModel";

/** In-app clipboard payload for flowchart subgraph copy/cut/paste. */
export type FlowClipboardPayload = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

const PASTE_OFFSET = 40;

/** Strip ephemeral UI/handler fields so clipboard snapshots stay serializable. */
export function stripNodeForClipboard(node: FlowNode): FlowNode {
  return {
    ...node,
    selected: false,
    dragging: false,
    position: { ...node.position },
    style: node.style ? { ...node.style } : node.style,
    measured: node.measured ? { ...node.measured } : node.measured,
    data: {
      label: node.data.label,
      kind: node.data.kind,
      shape: node.data.shape,
      fill: node.data.fill,
    },
  };
}

export function stripEdgeForClipboard(edge: FlowEdge): FlowEdge {
  return {
    ...edge,
    selected: false,
    data: edge.data
      ? {
          path: edge.data.path,
          startArrow: edge.data.startArrow,
          endArrow: edge.data.endArrow,
        }
      : edge.data,
    label: edge.label,
    type: edge.type,
    markerStart: edge.markerStart,
    markerEnd: edge.markerEnd,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    id: edge.id,
  };
}

/**
 * Build a clipboard payload from the current selection.
 * Includes selected nodes plus every edge whose both ends are in that node set
 * (so marquee-copied subgraphs keep internal connectors).
 */
export function extractClipboardSelection(
  nodes: FlowNode[],
  edges: FlowEdge[],
  selectedNodeIds: Iterable<string>,
): FlowClipboardPayload | null {
  const nodeIdSet = new Set(selectedNodeIds);
  if (nodeIdSet.size === 0) return null;
  const clippedNodes = nodes
    .filter((n) => nodeIdSet.has(n.id))
    .map(stripNodeForClipboard);
  if (clippedNodes.length === 0) return null;
  const clippedEdges = edges
    .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
    .map(stripEdgeForClipboard);
  return { nodes: clippedNodes, edges: clippedEdges };
}

export type RemapIds = {
  /** Allocate the next unique node id (`n-…`). */
  nextNodeId: () => string;
  /** Allocate the next unique edge id. */
  nextEdgeId: (source: string, sourceHandle: string | null | undefined, target: string, targetHandle: string | null | undefined) => string;
};

/**
 * Clone a clipboard payload with fresh ids and a positional offset.
 * Returns nodes/edges ready to merge into the canvas (still without handlers).
 */
export function cloneClipboardPayload(
  payload: FlowClipboardPayload,
  ids: RemapIds,
  offset: { x: number; y: number } = { x: PASTE_OFFSET, y: PASTE_OFFSET },
): { nodes: FlowNode[]; edges: FlowEdge[]; nodeIdMap: Map<string, string> } {
  const nodeIdMap = new Map<string, string>();
  const nodes = payload.nodes.map((n) => {
    const id = ids.nextNodeId();
    nodeIdMap.set(n.id, id);
    const base = stripNodeForClipboard(n);
    return {
      ...base,
      id,
      position: {
        x: base.position.x + offset.x,
        y: base.position.y + offset.y,
      },
      selected: true,
    };
  });

  const edges: FlowEdge[] = [];
  for (const e of payload.edges) {
    const source = nodeIdMap.get(e.source);
    const target = nodeIdMap.get(e.target);
    if (!source || !target) continue;
    const base = stripEdgeForClipboard(e);
    edges.push({
      ...base,
      id: ids.nextEdgeId(
        source,
        base.sourceHandle,
        target,
        base.targetHandle,
      ),
      source,
      target,
      selected: false,
    });
  }

  return { nodes, edges, nodeIdMap };
}

export { PASTE_OFFSET };
