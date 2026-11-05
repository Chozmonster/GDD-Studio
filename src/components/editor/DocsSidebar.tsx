import { useCallback, useEffect, useState } from "react";
import {
  createProjectDocument,
  deleteProjectDocument,
  listDocuments,
} from "../../api";
import type { DocSummary } from "../../types";

type DocsSidebarProps = {
  projectId: string;
  activeDocId: string;
  onSelect: (docId: string) => void;
  refreshKey?: number;
};

/**
 * Bottom left-rail pane: project documents (create / open / delete).
 * Independently scrollable; sits under Document map in a flex split.
 */
export function DocsSidebar({
  projectId,
  activeDocId,
  onSelect,
  refreshKey = 0,
}: DocsSidebarProps) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listDocuments(projectId);
      setDocs(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const createDoc = async () => {
    const title = window.prompt("New document title", "Untitled");
    if (title === null) return;
    const doc = await createProjectDocument(projectId, title);
    await refresh();
    onSelect(doc.id);
  };

  const removeDoc = async (doc: DocSummary) => {
    if (doc.id === "main") return;
    if (!window.confirm(`Delete “${doc.title}”?`)) return;
    await deleteProjectDocument(projectId, doc.id);
    await refresh();
    if (activeDocId === doc.id) onSelect("main");
  };

  return (
    <aside className="docs-sidebar" aria-label="Project documents">
      <header className="docs-sidebar-header">
        <h3>Documents</h3>
        <button
          type="button"
          className="ghost tiny-btn"
          title="New document"
          aria-label="New document"
          onClick={() => void createDoc()}
        >
          +
        </button>
      </header>
      {error && <p className="error tiny">{error}</p>}
      {loading && <p className="muted tiny docs-empty">Loading documents…</p>}
      {!loading && docs.length === 0 && (
        <p className="muted tiny docs-empty">No documents yet.</p>
      )}
      <ul className="docs-list">
        {docs.map((d) => (
          <li key={d.id} className={d.id === activeDocId ? "active" : undefined}>
            <button
              type="button"
              className="doc-pick"
              onClick={() => onSelect(d.id)}
            >
              {d.title}
            </button>
            {d.id !== "main" && (
              <button
                type="button"
                className="ghost tiny-btn"
                title="Delete document"
                aria-label={`Delete ${d.title}`}
                onClick={() => void removeDoc(d)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted tiny docs-hint">
        Type <code>[[Doc Title]]</code> to link across documents.
      </p>
    </aside>
  );
}
