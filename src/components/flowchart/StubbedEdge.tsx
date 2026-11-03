import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdgeData } from "./flowModel";
import {
  STUB_LEN,
  assertStubGeometry,
  buildAngledStubPath,
  buildCurvedStubPath,
  sideFromHandle,
  type Pt,
} from "./stubPath";

type StubbedEdgeProps = EdgeProps & {
  data?: FlowEdgeData;
};

/** Dev-only waypoint overlay; keep false in shipped UI. */
const DEBUG_WAYPOINTS = false;

function StubbedEdgeInner(props: StubbedEdgeProps, mode: "curve" | "step") {
  const sourceSide = sideFromHandle(
    props.sourceHandleId,
    props.sourcePosition,
  );
  const targetSide = sideFromHandle(
    props.targetHandleId,
    props.targetPosition,
  );

  const built =
    mode === "step"
      ? buildAngledStubPath(
          props.sourceX,
          props.sourceY,
          props.targetX,
          props.targetY,
          sourceSide,
          targetSide,
          STUB_LEN,
        )
      : buildCurvedStubPath(
          props.sourceX,
          props.sourceY,
          props.targetX,
          props.targetY,
          sourceSide,
          targetSide,
          STUB_LEN,
        );

  if (DEBUG_WAYPOINTS && typeof window !== "undefined") {
    const errs = assertStubGeometry(
      // For curves, assert using only the real polyline stubs (source→sStub, tStub→target)
      mode === "step"
        ? built.points
        : [
            built.points[0],
            built.points[1],
            built.points[built.points.length - 2],
            built.points[built.points.length - 1],
          ],
      sourceSide,
      targetSide,
      STUB_LEN,
    );
    if (errs.length) {
      console.warn(`[stub-edge ${props.id}]`, errs, {
        sourceHandle: props.sourceHandleId,
        targetHandle: props.targetHandleId,
        points: built.points,
      });
    }
  }

  return (
    <>
      <BaseEdge
        id={props.id}
        path={built.path}
        markerEnd={props.markerEnd}
        style={{ strokeWidth: 2, stroke: "#d0d0d0", ...props.style }}
        interactionWidth={24}
      />
      {DEBUG_WAYPOINTS ? <WaypointOverlay points={built.points} /> : null}
      {props.label ? (
        <EdgeLabelRenderer>
          <div
            className="flow-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${built.labelX}px, ${built.labelY}px)`,
            }}
          >
            {props.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function WaypointOverlay({ points }: { points: Pt[] }) {
  return (
    <g className="stub-debug-waypoints" aria-hidden>
      {points.map((p, i) => (
        <circle
          key={`${i}-${p.x}-${p.y}`}
          cx={p.x}
          cy={p.y}
          r={i === 0 || i === points.length - 1 ? 3.5 : 2.5}
          fill={i === 0 ? "#7cffb2" : i === points.length - 1 ? "#ff8b8b" : "#ffd27a"}
          stroke="#111"
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

export function StubCurveEdge(props: StubbedEdgeProps) {
  return StubbedEdgeInner(props, "curve");
}

export function StubStepEdge(props: StubbedEdgeProps) {
  return StubbedEdgeInner(props, "step");
}
