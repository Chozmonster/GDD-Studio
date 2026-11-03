import { useCallback, useEffect, useState } from "react";
import { loadVariables, saveVariables } from "../../api";
import { emitVariablesChanged } from "../../lib/variableEvents";
import type { DocVariable, DocVariableKind } from "../../types";

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

  const addVariable = () => {
    const id = crypto.randomUUID();
    const next: DocVariable = {
      id,
      name: `var${variables.length + 1}`,
      kind: "text",
      value: "",
    };
    void persist([...variables, next]);
  };

  const patch = (id: string, patch: Partial<DocVariable>) => {
    const next = variables.map((v) => (v.id === id ? { ...v, ...patch } : v));
    void persist(next);
  };

  const remove = (id: string) => {
    if (!window.confirm("Remove this variable? Embeds in the document will show as missing.")) {
      return;
    }
    void persist(variables.filter((v) => v.id !== id));
  };

  return (
    <aside className="doc-side-panel variables-panel" aria-label="Documentation variables">
      <header className="doc-side-header">
        <h3>Variables</h3>
        <button type="button" className="primary tiny-btn" onClick={addVariable}>
          Add
        </button>
      </header>
      {status ? <p className="error tiny">{status}</p> : null}
      {variables.length === 0 ? (
        <p className="muted tiny doc-side-empty">
          Named values that resolve live wherever you insert them.
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
                  onChange={(e) =>
                    patch(v.id, {
                      name: e.target.value.replace(/\s+/g, "_").slice(0, 48),
                    })
                  }
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
              <div className="var-row-fields">
                <select
                  className="var-kind"
                  aria-label="Variable type"
                  value={v.kind}
                  onChange={(e) =>
                    patch(v.id, { kind: e.target.value as DocVariableKind })
                  }
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                </select>
                <input
                  className="var-value"
                  aria-label="Variable value"
                  type={v.kind === "number" ? "number" : "text"}
                  value={v.value}
                  onChange={(e) => patch(v.id, { value: e.target.value })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
