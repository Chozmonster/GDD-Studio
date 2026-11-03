import { useCallback, useEffect, useState } from "react";
import {
  createRgdSheet,
  deleteRgdSheet,
  listRgdSheets,
  loadRgdSheet,
  saveRgdSheet,
} from "../../api";
import { emitRgdSheetDeleted, emitRgdSheetSaved } from "../../lib/rgdEvents";
import type { ProjectRecord, RgdSheetSummary } from "../../types";
import { normalizeRgdSheet } from "../editor/rgd/rgdSheetModel";

type RgdSidebarProps = {
  project: ProjectRecord;
  activeId: string | null;
  onSelect: (id: string, name: string) => void;
  onListChange?: (list: RgdSheetSummary[]) => void;
};

export function RgdSidebar({
  project,
  activeId,
  onSelect,
  onListChange,
}: RgdSidebarProps) {
  const [list, setList] = useState<RgdSheetSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await listRgdSheets(project.id);
    setList(items);
    onListChange?.(items);
    return items;
  }, [project.id, onListChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = window.prompt("New RGD sheet name", "Untitled gameplay");
    if (name === null) return;
    setBusy(true);
    try {
      const created = await createRgdSheet(project.id, name);
      const full = normalizeRgdSheet(
        await loadRgdSheet(project.id, created.id),
      );
      // Ensure steps skeleton is persisted for new sheets.
      await saveRgdSheet(project.id, created.id, {
        ...full,
        name: created.name,
      });
      emitRgdSheetSaved(project.id, created.id, {
        ...full,
        name: created.name,
      });
      const items = await refresh();
      const found = items.find((s) => s.id === created.id) ?? created;
      onSelect(found.id, found.name);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (item: RgdSheetSummary) => {
    const name = window.prompt("Rename RGD sheet", item.name);
    if (name === null) return;
    const trimmed = name.trim() || item.name;
    setBusy(true);
    try {
      const doc = normalizeRgdSheet(await loadRgdSheet(project.id, item.id));
      const next = { ...doc, name: trimmed };
      await saveRgdSheet(project.id, item.id, next);
      emitRgdSheetSaved(project.id, item.id, next);
      await refresh();
      if (item.id === activeId) onSelect(item.id, trimmed);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: RgdSheetSummary) => {
    if (
      !window.confirm(
        `Delete RGD sheet “${item.name}”? Document cards will show a broken state.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteRgdSheet(project.id, item.id);
      emitRgdSheetDeleted(project.id, item.id);
      const items = await refresh();
      if (item.id === activeId) {
        if (items[0]) onSelect(items[0].id, items[0].name);
        else onSelect("", "");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flowchart-sidebar rgd-sidebar" aria-label="RGD sheets">
      <header className="flowchart-sidebar-header">
        <h3>RGD sheets</h3>
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
        <p className="muted tiny rgd-sidebar-empty">
          No sheets yet. Create one for a gameplay loop.
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
      )}
    </aside>
  );
}
