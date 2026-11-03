import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdgeData } from "./flowModel";

/**
 * Perpendicular stub length — must read clearly past the arrowhead
 * (see media/flowchart-anchor-reference/desired-anchor-stubs.jpg).
 */
const STUB = 22;

function handleToPosition(
  handle?: string | null,
  fallback?: Position,
): Position {
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

/** Outward offset perpendicular to the node side (away from the node). */
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
  return path.replace(/^M\s*[-0-9.eE+]+[\s,]+[-0-9.eE+]+/, "").trim();
}

type StubbedEdgeProps = EdgeProps & {
  data?: FlowEdgeData;
};

/**
 * Orthogonal path with forced perpendicular stubs (reference style):
 * handle → stub → 90° bends → stub → handle.
 * Uses smooth-step `offset` so the first/last segments are always
 * perpendicular and never hug the node edge.
 */
function buildAngledPath(props: StubbedEdgeProps): {
  path: string;
  labelX: number;
  labelY: number;
} {
  const sourceSide = handleToPosition(
    props.sourceHandleId,
    props.sourcePosition,
  );
  const targetSide = handleToPosition(
    props.targetHandleId,
    props.targetPosition,
  );

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: sourceSide,
    targetPosition: targetSide,
    borderRadius: 0,
    offset: STUB,
  });

  return { path, labelX, labelY };
}

/**
 * Curved path with explicit straight stubs before/after the bezier,
 * so the handle attachment is always perpendicular even when the
 * curve would otherwise leave at a shallow angle.
 */
function buildCurvedPath(props: StubbedEdgeProps): {
  path: string;
  labelX: number;
  labelY: number;
} {
  const sourceSide = handleToPosition(
    props.sourceHandleId,
    props.sourcePosition,
  );
  const targetSide = handleToPosition(
    props.targetHandleId,
    props.targetPosition,
  );
  const s = stubPoint(props.sourceX, props.sourceY, sourceSide);
  const t = stubPoint(props.targetX, props.targetY, targetSide);

  const [inner, labelX, labelY] = getBezierPath({
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
  const { path, labelX, labelY } =
    mode === "step" ? buildAngledPath(props) : buildCurvedPath(props);
  const label = props.label;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        style={{ strokeWidth: 1.75, ...props.style }}
        interactionWidth={24}
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
