import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { loadVariables } from "../../api";
import { onVariablesChanged } from "../../lib/variableEvents";
import type { DocVariable } from "../../types";

type ExtraProps = {
  projectId: string;
};

function displayValue(v: DocVariable | undefined): string {
  if (!v) return "???";
  if (v.kind === "number") {
    const n = Number(v.value);
    return Number.isFinite(n) ? String(n) : v.value;
  }
  return v.value || "—";
}

export function VariableEmbedView(props: NodeViewProps) {
  const variableId = String(props.node.attrs.variableId ?? "");
  const nameHint = String(props.node.attrs.name ?? "");
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [variable, setVariable] = useState<DocVariable | null>(null);
  const [missing, setMissing] = useState(false);

  const updateAttributes = props.updateAttributes;

  useEffect(() => {
    let cancelled = false;
    void loadVariables(projectId).then((list) => {
      if (cancelled) return;
      const found =
        list.find((v) => v.id === variableId) ??
        list.find((v) => v.name === nameHint) ??
        null;
      setVariable(found);
      setMissing(!found);
      if (found && found.name !== nameHint) {
        updateAttributes({ name: found.name });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, variableId, nameHint, updateAttributes]);

  useEffect(() => {
    return onVariablesChanged((detail) => {
      if (detail.projectId !== projectId) return;
      const found =
        detail.variables.find((v) => v.id === variableId) ??
        detail.variables.find((v) => v.name === nameHint) ??
        null;
      setVariable(found);
      setMissing(!found);
      if (found && found.name !== nameHint) {
        updateAttributes({ name: found.name });
      }
    });
  }, [projectId, variableId, nameHint, updateAttributes]);

  const label = (variable?.name ?? nameHint) || "var";

  return (
    <NodeViewWrapper
      as="span"
      className={missing ? "variable-chip missing" : "variable-chip"}
      contentEditable={false}
      title={missing ? `Missing variable` : `${label} = ${displayValue(variable ?? undefined)}`}
    >
      <span className="variable-chip-name">{label}</span>
      <span className="variable-chip-value">{displayValue(variable ?? undefined)}</span>
    </NodeViewWrapper>
  );
}
