import { useCallback, useEffect, useState } from "react";
import {
  createWhiteboard,
  deleteWhiteboard,
  listWhiteboards,
  loadWhiteboard,
  saveWhiteboard,
} from "../../api";
import {
  emitWhiteboardDeleted,
  emitWhiteboardSaved,
} from "../../lib/whiteboardEvents";
import type { ProjectRecord, WhiteboardSummary } from "../../types";

type WhiteboardSidebarProps = {
  project: ProjectRecord;
  activeId: string;
  onSelect: (id: string, name: string) => void;
};

export function WhiteboardSidebar({
  project,
  activeId,
  onSelect,
}: WhiteboardSidebarProps) {
  const [list, setList] = useState<WhiteboardSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await listWhiteboards(project.id);
    setList(items);
    return items;
  }, [project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = window.prompt("New whiteboard name", "Untitled");
    if (name === null) return;
    setBusy(true);
    try {
      const created = await createWhiteboard(project.id, name);
      const items = await refresh();
      const found = items.find((c) => c.id === created.id) ?? created;
      onSelect(found.id, found.name);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (item: WhiteboardSummary) => {
    const name = window.prompt("Rename whiteboard", item.name);
    if (name === null) return;
    const trimmed = name.trim() || item.name;
    setBusy(true);
    try {
      const doc = await loadWhiteboard(project.id, item.id);
      const next = { ...doc, name: trimmed };
      await saveWhiteboard(project.id, item.id, next);
      emitWhiteboardSaved(project.id, item.id, next);
      await refresh();
      if (item.id === activeId) onSelect(item.id, trimmed);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: WhiteboardSummary) => {
    if (item.id === "main") return;
    if (
      !window.confirm(
        `Delete whiteboard “${item.name}”? Document embeds that target this board will show a broken state.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteWhiteboard(project.id, item.id);
      emitWhiteboardDeleted(project.id, item.id);
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
    <aside
      className="flowchart-sidebar whiteboard-sidebar"
      aria-label="Whiteboards in project"
    >
      <header className="flowchart-sidebar-header">
        <h3>Whiteboard</h3>
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
          No boards yet. Create one to doodle.
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
                      ? "Main whiteboard cannot be deleted"
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
