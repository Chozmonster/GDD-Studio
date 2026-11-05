import { useCallback, useEffect, useState } from "react";
import {
  loadVariables,
  normalizeVariableName,
  saveVariables,
} from "../../api";
import {
  emitVariablesChanged,
  onVariablesChanged,
} from "../../lib/variableEvents";
import type { DocVariable } from "../../types";

type VariablesPanelProps = {
  projectId: string;
  onInsert?: (variable: DocVariable) => void;
};

export function VariablesPanel({ projectId, onInsert }: VariablesPanelProps) {
  const [variables, setVariables] = useState<DocVariable[]>([]);
  const [status, setStatus] = useState("");

  const persist = useCallback(
    async (next: DocVariable[]) => {
      setVariables(next);
      try {
        await saveVariables(projectId, next);
        emitVariablesChanged(projectId, next);
        setStatus("");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [projectId],
  );

  useEffect(() => {
    let cancelled = false;
    void loadVariables(projectId).then((list) => {
      if (!cancelled) setVariables(list);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    return onVariablesChanged((detail) => {
      if (detail.projectId !== projectId) return;
      setVariables(detail.variables);
    });
  }, [projectId]);

  const addVariable = () => {
    const id = crypto.randomUUID();
    const next: DocVariable = {
      id,
      name: `var${variables.length + 1}`,
      value: "",
    };
    void persist([...variables, next]);
  };

  const patch = (id: string, patch: Partial<DocVariable>) => {
    const next = variables.map((v) => {
      if (v.id !== id) return v;
      const merged = { ...v, ...patch };
      if (patch.name !== undefined) {
        merged.name = normalizeVariableName(patch.name);
      }
      return merged;
    });
    void persist(next);
  };

  const remove = (id: string) => {
    if (
      !window.confirm(
        "Remove this variable? Embeds in the document will show as missing.",
      )
    ) {
      return;
    }
    void persist(variables.filter((v) => v.id !== id));
  };

  return (
    <aside
      className="doc-side-panel variables-panel"
      aria-label="Documentation variables"
    >
      <header className="doc-side-header">
        <h3>Variables</h3>
        <button type="button" className="primary tiny-btn" onClick={addVariable}>
          Add
        </button>
      </header>
      {status ? <p className="error tiny">{status}</p> : null}
      {variables.length === 0 ? (
        <p className="muted tiny doc-side-empty">
          Project-wide plain-text values. Type{" "}
          <code>{"{{name}}"}</code> in the document to insert (creates if
          missing).
        </p>
      ) : (
        <ul className="variables-list">
          {variables.map((v) => (
            <li key={v.id} className="variable-row">
              <div className="var-row-top">
                <input
                  className="var-name"
                  aria-label="Variable name"
                  value={v.name}
                  onChange={(e) => patch(v.id, { name: e.target.value })}
                />
                <div className="var-row-actions">
                  {onInsert ? (
                    <button
                      type="button"
                      className="ghost tiny-btn"
                      title="Insert into document"
                      onClick={() => onInsert(v)}
                    >
                      Insert
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost tiny-btn danger-outline"
                    onClick={() => remove(v.id)}
                    aria-label={`Remove ${v.name}`}
                  >
                    ×
                  </button>
                </div>
              </div>
              <input
                className="var-value"
                aria-label="Variable value"
                type="text"
                value={v.value}
                onChange={(e) => patch(v.id, { value: e.target.value })}
              />
            </li>
          ))}
        </ul>
      )}
      {variables.length > 0 ? (
        <p className="muted tiny docs-hint">
          Project-wide plain text. Type <code>{"{{name}}"}</code> to insert.
        </p>
      ) : null}
    </aside>
  );
}
