import { useEffect, useRef, useState } from "react";
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

type StubbedEdgeInnerProps = StubbedEdgeProps & {
  mode: "curve" | "step";
};

/** Dev-only waypoint overlay; keep false in shipped UI. */
const DEBUG_WAYPOINTS = false;

function StubbedEdgeInner({ mode, ...props }: StubbedEdgeInnerProps) {
  const canEdit = typeof props.data?.onChangeLabel === "function";
  const labelText =
    typeof props.label === "string"
      ? props.label
      : props.label != null
        ? String(props.label)
        : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(labelText);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(labelText);
  }, [labelText, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Toolbar / context menu request inline edit via a bumped token.
  const startEditToken = props.data?.startEditToken;
  useEffect(() => {
    if (!canEdit || !startEditToken) return;
    setDraft(labelText);
    setEditing(true);
    // Only react to the token bump — not labelText changes while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEditToken, canEdit]);

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

  const beginEdit = () => {
    if (!canEdit) return;
    setDraft(labelText);
    setEditing(true);
  };

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    const next = draft.trim();
    if (next !== labelText) {
      props.data?.onChangeLabel?.(props.id, next);
    }
  };

  const cancel = () => {
    setDraft(labelText);
    setEditing(false);
  };

  const showLabelChrome =
    editing || Boolean(labelText) || (canEdit && Boolean(props.selected));

  return (
    <>
      <BaseEdge
        id={props.id}
        path={built.path}
        markerStart={props.markerStart}
        markerEnd={props.markerEnd}
        style={{ strokeWidth: 2, stroke: "#d0d0d0", ...props.style }}
        interactionWidth={24}
      />
      {DEBUG_WAYPOINTS ? <WaypointOverlay points={built.points} /> : null}
      {showLabelChrome ? (
        <EdgeLabelRenderer>
          <div
            className={
              editing
                ? "flow-edge-label flow-edge-label-editing nodrag nopan"
                : labelText
                  ? "flow-edge-label nodrag nopan"
                  : "flow-edge-label flow-edge-label-empty nodrag nopan"
            }
            style={{
              transform: `translate(-50%, -50%) translate(${built.labelX}px, ${built.labelY}px)`,
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              beginEdit();
            }}
            title={
              canEdit && !editing
                ? labelText
                  ? "Double-click to edit label"
                  : "Double-click to add label"
                : undefined
            }
          >
            {editing ? (
              <input
                ref={inputRef}
                className="flow-edge-label-input"
                value={draft}
                aria-label="Edge label"
                placeholder="Label"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  }
                }}
              />
            ) : labelText ? (
              labelText
            ) : (
              <span className="flow-edge-label-placeholder">Label</span>
            )}
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
  return <StubbedEdgeInner {...props} mode="curve" />;
}

export function StubStepEdge(props: StubbedEdgeProps) {
  return <StubbedEdgeInner {...props} mode="step" />;
}
