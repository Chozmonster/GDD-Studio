import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdgeData } from "./flowModel";

const STUB = 14;

function handleToPosition(handle?: string | null, fallback?: Position): Position {
  switch (handle) {
    case "top":
      return Position.Top;
    case "right":
      return Position.Right;
    case "bottom":
      return Position.Bottom;
    case "left":
      return Position.Left;
    default:
      return fallback ?? Position.Right;
  }
}

/** Short outward offset perpendicular to the node side. */
function stubPoint(
  x: number,
  y: number,
  side: Position,
  length = STUB,
): { x: number; y: number } {
  switch (side) {
    case Position.Top:
      return { x, y: y - length };
    case Position.Bottom:
      return { x, y: y + length };
    case Position.Left:
      return { x: x - length, y };
    case Position.Right:
    default:
      return { x: x + length, y };
  }
}

function stripLeadingMove(path: string): string {
  // Drop the initial "M x y" so we can prefix our own stub segments.
  return path.replace(/^M\s*[-0-9.]+[\s,]+[-0-9.]+/, "").trim();
}

type StubbedEdgeProps = EdgeProps & {
  data?: FlowEdgeData;
};

function buildStubbedPath(
  props: StubbedEdgeProps,
  mode: "curve" | "step",
): { path: string; labelX: number; labelY: number } {
  const sourceSide = handleToPosition(props.sourceHandleId, props.sourcePosition);
  const targetSide = handleToPosition(props.targetHandleId, props.targetPosition);
  const s = stubPoint(props.sourceX, props.sourceY, sourceSide);
  const t = stubPoint(props.targetX, props.targetY, targetSide);

  const [inner, labelX, labelY] =
    mode === "step"
      ? getSmoothStepPath({
          sourceX: s.x,
          sourceY: s.y,
          targetX: t.x,
          targetY: t.y,
          sourcePosition: sourceSide,
          targetPosition: targetSide,
          borderRadius: 6,
        })
      : getBezierPath({
          sourceX: s.x,
          sourceY: s.y,
          targetX: t.x,
          targetY: t.y,
          sourcePosition: sourceSide,
          targetPosition: targetSide,
        });

  const path = [
    `M ${props.sourceX} ${props.sourceY}`,
    `L ${s.x} ${s.y}`,
    stripLeadingMove(inner),
    `L ${props.targetX} ${props.targetY}`,
  ].join(" ");

  return { path, labelX, labelY };
}

function StubbedEdgeInner(props: StubbedEdgeProps, mode: "curve" | "step") {
  const { path, labelX, labelY } = buildStubbedPath(props, mode);
  const label = props.label;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={props.style}
        interactionWidth={20}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="flow-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export function StubCurveEdge(props: StubbedEdgeProps) {
  return StubbedEdgeInner(props, "curve");
}

export function StubStepEdge(props: StubbedEdgeProps) {
  return StubbedEdgeInner(props, "step");
}
