import { useCallback, useEffect, useState } from "react";
import {
  createFlowchart,
  deleteFlowchart,
  listFlowcharts,
  loadFlowchart,
  saveFlowchart,
} from "../../api";
import {
  emitFlowchartDeleted,
  emitFlowchartSaved,
} from "../../lib/flowchartEvents";
import type { FlowchartSummary, ProjectRecord } from "../../types";

type FlowchartSidebarProps = {
  project: ProjectRecord;
  activeId: string;
  onSelect: (id: string, name: string) => void;
  onListChange?: (list: FlowchartSummary[]) => void;
};

export function FlowchartSidebar({
  project,
  activeId,
  onSelect,
  onListChange,
}: FlowchartSidebarProps) {
  const [list, setList] = useState<FlowchartSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await listFlowcharts(project.id);
    setList(items);
    onListChange?.(items);
    return items;
  }, [project.id, onListChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = window.prompt("New flowchart name", "Untitled");
    if (name === null) return;
    setBusy(true);
    try {
      const created = await createFlowchart(project.id, name);
      const items = await refresh();
      const found = items.find((f) => f.id === created.id) ?? created;
      onSelect(found.id, found.name);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (item: FlowchartSummary) => {
    const name = window.prompt("Rename flowchart", item.name);
    if (name === null) return;
    const trimmed = name.trim() || item.name;
    setBusy(true);
    try {
      const doc = await loadFlowchart(project.id, item.id);
      const next = { ...doc, name: trimmed };
      await saveFlowchart(project.id, item.id, next);
      emitFlowchartSaved(project.id, item.id, next);
      await refresh();
      if (item.id === activeId) onSelect(item.id, trimmed);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: FlowchartSummary) => {
    if (
      !window.confirm(
        `Delete flowchart “${item.name}”? Document embeds will show a broken state.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteFlowchart(project.id, item.id);
      emitFlowchartDeleted(project.id, item.id);
      const items = await refresh();
      if (item.id === activeId) {
        const fallback = items[0] ?? { id: "main", name: "Main" };
        onSelect(fallback.id, fallback.name);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flowchart-sidebar" aria-label="Flowcharts in project">
      <header className="flowchart-sidebar-header">
        <h3>Flowcharts</h3>
        <button
          type="button"
          className="primary tiny-btn"
          disabled={busy}
          onClick={() => void handleCreate()}
        >
          New
        </button>
      </header>
      <ul className="flowchart-sidebar-list">
        {list.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={
                item.id === activeId
                  ? "flowchart-side-row active"
                  : "flowchart-side-row"
              }
              onClick={() => onSelect(item.id, item.name)}
            >
              <span className="flowchart-side-name">{item.name}</span>
              <span className="muted tiny">{item.id}</span>
            </button>
            <div className="flowchart-side-actions">
              <button
                type="button"
                className="ghost tiny-btn"
                disabled={busy}
                onClick={() => void handleRename(item)}
                title="Rename"
              >
                Rename
              </button>
              <button
                type="button"
                className="ghost tiny-btn danger-outline"
                disabled={busy}
                onClick={() => void handleDelete(item)}
                title="Delete"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
