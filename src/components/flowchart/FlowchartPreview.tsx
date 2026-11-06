import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  ReactFlow,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { FlowchartDocument } from "../../types";
import { FlowNode } from "./FlowNode";
import { StubCurveEdge, StubStepEdge } from "./StubbedEdge";
import { migrateEdge, migrateNode } from "./flowModel";

const nodeTypes = { flow: FlowNode, labeled: FlowNode };
const edgeTypes = {
  stubCurve: StubCurveEdge,
  stubStep: StubStepEdge,
  default: StubCurveEdge,
  step: StubStepEdge,
};

/** Padding so fitted nodes aren't flush against the embed chrome. */
const FIT_PADDING = 0.2;

/** Only the fitView surface we call — avoids generic Node/Edge instance typing friction. */
type FitViewInstance = {
  fitView: (options?: { padding?: number; duration?: number }) => Promise<boolean>;
};

type FlowchartPreviewProps = {
  document: FlowchartDocument;
  className?: string;
};

/**
 * Read-only live preview of a flowchart document (for TipTap embeds).
 *
 * Always keeps the graph centered and fully visible in the embed frame:
 * fitView on mount / content change / container resize, and no free pan
 * (including Space+drag). The full Flowcharts editor keeps Miro-like panning.
 */
export function FlowchartPreview({ document, className }: FlowchartPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<FitViewInstance | null>(null);
  const nodeCountRef = useRef(0);
  const fitEmbedRef = useRef(() => {});

  const nodes = useMemo(
    () =>
      (document.nodes ?? []).map((n) => ({
        ...migrateNode(n),
        draggable: false,
        selectable: false,
        connectable: false,
      })),
    [document],
  );
  const edges = useMemo(
    () =>
      (document.edges ?? []).map((e) => ({
        ...migrateEdge(e),
        selectable: false,
      })),
    [document],
  );

  nodeCountRef.current = nodes.length;
  fitEmbedRef.current = () => {
    const instance = instanceRef.current;
    if (!instance || nodeCountRef.current === 0) return;
    void instance.fitView({ padding: FIT_PADDING, duration: 0 });
  };

  /** Changes when live-by-reference saves move/add/remove graph geometry. */
  const contentKey = useMemo(
    () =>
      nodes
        .map(
          (n) =>
            `${n.id}:${n.position.x.toFixed(1)}:${n.position.y.toFixed(1)}`,
        )
        .join("|") +
      "::" +
      edges.map((e) => e.id).join("|"),
    [nodes, edges],
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => fitEmbedRef.current());
    return () => cancelAnimationFrame(id);
  }, [contentKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => fitEmbedRef.current());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={className ?? "flowchart-preview"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView={nodes.length > 0}
        fitViewOptions={{ padding: FIT_PADDING }}
        onInit={(instance) => {
          instanceRef.current = instance;
          if (nodeCountRef.current > 0) {
            void instance.fitView({ padding: FIT_PADDING, duration: 0 });
          }
        }}
        panOnDrag={false}
        panOnScroll={false}
        panActivationKeyCode={null}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#3a3a3a" />
      </ReactFlow>
    </div>
  );
}
