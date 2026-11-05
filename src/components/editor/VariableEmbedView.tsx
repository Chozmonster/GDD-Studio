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
  return v.value || "—";
}

function findVariable(
  list: DocVariable[],
  variableId: string,
  nameHint: string,
): DocVariable | null {
  if (variableId) {
    const byId = list.find((v) => v.id === variableId);
    if (byId) return byId;
  }
  if (!nameHint) return null;
  const lower = nameHint.toLowerCase();
  return list.find((v) => v.name.toLowerCase() === lower) ?? null;
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
      const found = findVariable(list, variableId, nameHint);
      setVariable(found);
      setMissing(!found);
      if (
        found &&
        (found.id !== variableId || found.name !== nameHint)
      ) {
        updateAttributes({ variableId: found.id, name: found.name });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, variableId, nameHint, updateAttributes]);

  useEffect(() => {
    return onVariablesChanged((detail) => {
      if (detail.projectId !== projectId) return;
      const found = findVariable(detail.variables, variableId, nameHint);
      setVariable(found);
      setMissing(!found);
      if (
        found &&
        (found.id !== variableId || found.name !== nameHint)
      ) {
        updateAttributes({ variableId: found.id, name: found.name });
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
