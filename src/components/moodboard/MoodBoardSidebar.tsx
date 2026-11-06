import { useCallback, useEffect, useState } from "react";
import {
  createMoodBoard,
  deleteMoodBoard,
  listMoodBoards,
  loadMoodBoard,
  saveMoodBoard,
} from "../../api";
import {
  emitMoodBoardDeleted,
  emitMoodBoardSaved,
} from "../../lib/moodBoardEvents";
import type { MoodBoardSummary, ProjectRecord } from "../../types";

type MoodBoardSidebarProps = {
  project: ProjectRecord;
  activeId: string;
  onSelect: (id: string, name: string) => void;
  onListChange?: (list: MoodBoardSummary[]) => void;
};

export function MoodBoardSidebar({
  project,
  activeId,
  onSelect,
  onListChange,
}: MoodBoardSidebarProps) {
  const [list, setList] = useState<MoodBoardSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const items = await listMoodBoards(project.id);
    setList(items);
    onListChange?.(items);
    return items;
  }, [project.id, onListChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = window.prompt("New mood board name", "Untitled");
    if (name === null) return;
    setBusy(true);
    try {
      const created = await createMoodBoard(project.id, name);
      const items = await refresh();
      const found = items.find((b) => b.id === created.id) ?? created;
      onSelect(found.id, found.name);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (item: MoodBoardSummary) => {
    const name = window.prompt("Rename mood board", item.name);
    if (name === null) return;
    const trimmed = name.trim() || item.name;
    setBusy(true);
    try {
      const doc = await loadMoodBoard(project.id, item.id);
      const next = { ...doc, name: trimmed };
      await saveMoodBoard(project.id, item.id, next);
      emitMoodBoardSaved(project.id, item.id, next);
      await refresh();
      if (item.id === activeId) onSelect(item.id, trimmed);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item: MoodBoardSummary) => {
    if (item.id === "main") return;
    if (
      !window.confirm(
        `Delete mood board “${item.name}”? Document embeds that target this board will show a broken state.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteMoodBoard(project.id, item.id);
      emitMoodBoardDeleted(project.id, item.id);
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
    <aside className="flowchart-sidebar mood-board-sidebar" aria-label="Mood boards in project">
      <header className="flowchart-sidebar-header">
        <h3>Mood boards</h3>
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
          No mood boards yet. Create one to collect reference media.
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
                      ? "Main mood board cannot be deleted"
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
