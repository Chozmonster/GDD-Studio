import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { fetchSettings, loadVariables } from "../../api";
import { onSettingsChanged } from "../../lib/settingsEvents";
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
  const [showNames, setShowNames] = useState(false);

  const updateAttributes = props.updateAttributes;

  useEffect(() => {
    let cancelled = false;
    void fetchSettings().then((s) => {
      if (!cancelled) setShowNames(s.displayVariableNames);
    });
    const off = onSettingsChanged((detail) => {
      setShowNames(detail.settings.displayVariableNames);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

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
  const value = displayValue(variable ?? undefined);
  const tooltip = missing
    ? "Missing variable"
    : showNames
      ? `${label} = ${value}`
      : label;

  return (
    <NodeViewWrapper
      as="span"
      className={
        missing
          ? "variable-chip missing"
          : showNames
            ? "variable-chip show-names"
            : "variable-chip"
      }
      contentEditable={false}
      title={tooltip}
    >
      {showNames ? (
        <>
          <span className="variable-chip-name">{label}</span>
          <span className="variable-chip-value">{value}</span>
        </>
      ) : (
        <span className="variable-chip-value">{value}</span>
      )}
    </NodeViewWrapper>
  );
}
