import { memo, useEffect, useRef, useState } from "react";
import {
  Handle,
  NodeResizer,
  Position,
  type NodeProps,
} from "@xyflow/react";
import {
  contrastInk,
  type FlowNode as FlowNodeType,
} from "./flowModel";

function FlowNodeComponent({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<FlowNodeType>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const ink = contrastInk(data.fill);

  useEffect(() => {
    setDraft(data.label);
  }, [data.label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim() || "Node";
    setDraft(next);
    if (next !== data.label) data.onChangeLabel?.(id, next);
  };

  return (
    <div
      className={selected ? "flow-node-wrap selected" : "flow-node-wrap"}
      style={{ width: width ?? undefined, height: height ?? undefined }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={data.shape === "diamond" ? 80 : 90}
        minHeight={data.shape === "diamond" ? 80 : 44}
        color="#7aa892"
      />
      <Handle type="target" position={Position.Top} className="nodrag" />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="nodrag"
      />
      <div
        className={`flow-shape shape-${data.shape} kind-${data.kind}`}
        style={{ background: data.fill, color: ink }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="flow-node-input nodrag nopan"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(data.label);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="flow-node-label nodrag nopan"
            style={{ color: ink }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {data.label || "Node"}
          </button>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="nodrag"
      />
      <Handle type="source" position={Position.Bottom} className="nodrag" />
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);
