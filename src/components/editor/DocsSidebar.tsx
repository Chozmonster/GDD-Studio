import { useCallback, useEffect, useState } from "react";
import {
  createProjectDocument,
  deleteProjectDocument,
  listBacklinks,
  listDocuments,
} from "../../api";
import type { DocSummary } from "../../types";

type DocsSidebarProps = {
  projectId: string;
  activeDocId: string;
  onSelect: (docId: string) => void;
  refreshKey?: number;
};

export function DocsSidebar({
  projectId,
  activeDocId,
  onSelect,
  refreshKey = 0,
}: DocsSidebarProps) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [backlinks, setBacklinks] = useState<DocSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listDocuments(projectId);
      setDocs(list);
      setError(null);
      if (activeDocId) {
        setBacklinks(await listBacklinks(projectId, activeDocId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, activeDocId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const createDoc = async () => {
    const title = window.prompt("New document title", "Untitled page");
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
      <div className="docs-sidebar-header">
        <h3>Pages</h3>
        <button type="button" className="ghost tiny-btn" onClick={() => void createDoc()}>
          +
        </button>
      </div>
      {error && <p className="error tiny">{error}</p>}
      {loading && <p className="muted tiny docs-empty">Loading pages…</p>}
      {!loading && docs.length === 0 && (
        <p className="muted tiny docs-empty">No pages yet.</p>
      )}
      <ul className="docs-list">
        {docs.map((d) => (
          <li key={d.id} className={d.id === activeDocId ? "active" : undefined}>
            <button type="button" className="doc-pick" onClick={() => onSelect(d.id)}>
              {d.title}
            </button>
            {d.id !== "main" && (
              <button
                type="button"
                className="ghost tiny-btn"
                title="Delete page"
                onClick={() => void removeDoc(d)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="docs-sidebar-header backlinks-header">
        <h3>Backlinks</h3>
      </div>
      {backlinks.length === 0 ? (
        <p className="muted tiny docs-empty">No pages link here yet.</p>
      ) : (
        <ul className="docs-list backlinks-list">
          {backlinks.map((d) => (
            <li key={d.id}>
              <button type="button" className="doc-pick" onClick={() => onSelect(d.id)}>
                ← {d.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted tiny docs-hint">Type [[Page Title]] to link.</p>
    </aside>
  );
}
