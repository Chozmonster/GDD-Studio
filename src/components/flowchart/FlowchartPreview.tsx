import { useMemo } from "react";
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
const edgeTypes = { stubCurve: StubCurveEdge, stubStep: StubStepEdge, default: StubCurveEdge, step: StubStepEdge };

type FlowchartPreviewProps = {
  document: FlowchartDocument;
  className?: string;
};

/** Read-only live preview of a flowchart document (for TipTap embeds). */
export function FlowchartPreview({ document, className }: FlowchartPreviewProps) {
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

  return (
    <div className={className ?? "flowchart-preview"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
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
