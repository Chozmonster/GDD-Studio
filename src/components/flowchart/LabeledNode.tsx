import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

export type LabeledNodeData = {
  label: string;
  onChangeLabel?: (id: string, label: string) => void;
};

export type LabeledFlowNode = Node<LabeledNodeData, "labeled">;

function LabeledNodeComponent({ id, data, selected }: NodeProps<LabeledFlowNode>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (next !== data.label) {
      data.onChangeLabel?.(id, next);
    }
  };

  return (
    <div className={selected ? "flow-node selected" : "flow-node"}>
      <Handle type="target" position={Position.Top} className="nodrag" />
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
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title="Double-click to edit label"
        >
          {data.label || "Node"}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className="nodrag" />
    </div>
  );
}

export const LabeledNode = memo(LabeledNodeComponent);
