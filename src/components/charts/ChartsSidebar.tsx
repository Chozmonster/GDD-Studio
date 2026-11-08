import { useCallback, useEffect, useState } from "react";
import {
  createChart,
  deleteChart,
  listCharts,
  loadChart,
  saveChart,
} from "../../api";
import { emitChartDeleted, emitChartSaved } from "../../lib/chartEvents";
import type { ChartSummary, ProjectRecord } from "../../types";

type ChartsSidebarProps = {
  project: ProjectRecord;
  activeId: string;
  onSelect: (id: string, name: string) => void;
  onListChange?: (list: ChartSummary[]) => void;
};

export function ChartsSidebar({
  project,
  activeId,
  onSelect,
  onListChange,
}: ChartsSidebarProps) {
  const [list, setList] = useState<ChartSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await listCharts(project.id);
    setList(items);
    onListChange?.(items);
    return items;
  }, [project.id, onListChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = window.prompt("New chart name", "Untitled");
    if (name === null) return;
    setBusy(true);
    try {
      const created = await createChart(project.id, name);
      const items = await refresh();
      const found = items.find((c) => c.id === created.id) ?? created;
      onSelect(found.id, found.name);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (item: ChartSummary) => {
    const name = window.prompt("Rename chart", item.name);
    if (name === null) return;
    const trimmed = name.trim() || item.name;
    setBusy(true);
    try {
      const doc = await loadChart(project.id, item.id);
      const next = { ...doc, name: trimmed };
      await saveChart(project.id, item.id, next);
      emitChartSaved(project.id, item.id, next);
      await refresh();
      if (item.id === activeId) onSelect(item.id, trimmed);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: ChartSummary) => {
    if (item.id === "main") return;
    if (
      !window.confirm(
        `Delete chart “${item.name}”? Document embeds that target this chart will show a broken state.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteChart(project.id, item.id);
      emitChartDeleted(project.id, item.id);
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
    <aside className="flowchart-sidebar charts-sidebar" aria-label="Charts in project">
      <header className="flowchart-sidebar-header">
        <h3>Charts</h3>
        <button
          type="button"
          className="primary tiny-btn"
          disabled={busy}
          onClick={() => void handleCreate()}
        >
          New
        </button>
      </header>
      {list.length === 0 ? (
        <p className="muted tiny flowchart-sidebar-empty">
          No charts yet. Create one for XP or power curves.
        </p>
      ) : (
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
                  disabled={busy || item.id === "main"}
                  onClick={() => void handleDelete(item)}
                  title={
                    item.id === "main"
                      ? "Main chart cannot be deleted"
                      : "Delete"
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
