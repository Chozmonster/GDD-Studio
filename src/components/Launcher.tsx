import { useCallback, useEffect, useState } from "react";
import {
  checkForUpdates,
  createProject,
  createRgdSheet,
  deleteProject,
  fetchHealth,
  fetchPatchNotes,
  fetchProjects,
  installUpdate,
  openOptionsWindow,
  openProject,
  saveDocument,
  saveRgdSheet,
} from "../api";
import { emitRgdSheetSaved } from "../lib/rgdEvents";
import type { HealthStatus, ProjectRecord, UpdateStatus } from "../types";
import { buildRgdStarterDoc } from "./editor/rgd/migrateRgdBlocks";
import { emptyRgdSheetDocument } from "./editor/rgd/rgdSheetModel";
import { HelpPanel } from "./help/HelpPanel";
import { NewProjectDialog } from "./NewProjectDialog";
import { OptionsPanel } from "./OptionsPanel";

type LauncherProps = {
  onOpenProject: (project: ProjectRecord) => void;
};

export function Launcher({ onOpenProject }: LauncherProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [optionsModal, setOptionsModal] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, list] = await Promise.all([fetchHealth(), fetchProjects()]);
      setHealth(h);
      setProjects(list);
      setSelectedId((prev) =>
        prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshUpdates = useCallback(async (force: boolean) => {
    try {
      const status = await checkForUpdates(force);
      setUpdate(status);
    } catch {
      /* soft-fail — no endpoint / unsigned releases */
    }
  }, []);

  useEffect(() => {
    void refreshUpdates(false);
  }, [refreshUpdates]);

  useEffect(() => {
    if (!optionsModal) {
      void refreshUpdates(false);
    }
  }, [optionsModal, refreshUpdates]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const handleOpen = async (project: ProjectRecord) => {
    setBusyId(project.id);
    try {
      const opened = await openProject(project.id);
      onOpenProject(opened);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `Remove “${selected.name}” from the project list?\n\n${selected.path}\n\nThis only removes the library entry — it does not delete files on disk.`,
    );
    if (!ok) return;
    try {
      await deleteProject(selected.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreate = async (
    name: string,
    parentDir: string,
    options?: { rgdTemplate?: boolean },
  ) => {
    const created = await createProject(name, parentDir);
    if (options?.rgdTemplate) {
      const sheetSummary = await createRgdSheet(created.id, "Main gameplay");
      const sheet = emptyRgdSheetDocument(sheetSummary.id, sheetSummary.name);
      await saveRgdSheet(created.id, sheet.id, sheet);
      emitRgdSheetSaved(created.id, sheet.id, sheet);
      await saveDocument(
        created.id,
        buildRgdStarterDoc(created.name, sheet.id),
      );
    }
    await refresh();
    const opened = await openProject(created.id);
    onOpenProject(opened);
  };

  const handleOptions = async () => {
    try {
      await openOptionsWindow();
    } catch {
      setOptionsModal(true);
    }
  };

  const showUpdateBanner =
    update &&
    (update.state === "available" || update.state === "simulated") &&
    !update.automaticUpdates;

  const formatOpened = (ts: number | null) => {
    if (!ts) return "Never opened";
    return `Last opened ${new Date(ts * 1000).toLocaleString()}`;
  };

  return (
    <div className="launcher-shell">
      <header className="launcher-chrome">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>GDD Studio</h1>
            <p className="muted tiny">Project Manager</p>
          </div>
        </div>
        <div className="launcher-chrome-actions">
          <span className="muted tiny">
            {health ? `v${health.version}` : "…"}
          </span>
          <button type="button" className="ghost" onClick={() => setHelpOpen(true)}>
            Help
          </button>
          <button type="button" onClick={() => void handleOptions()}>
            Options
          </button>
        </div>
      </header>

      {showUpdateBanner && (
        <div className="update-banner" role="status">
          <div>
            <strong>Update available</strong>
            <span className="muted">
              {" "}
              {update.availableVersion
                ? `(${update.currentVersion} → ${update.availableVersion})`
                : null}
            </span>
            <p className="muted tiny">{update.message}</p>
          </div>
          <div className="update-banner-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (update?.notes) {
                  setNotes(update.notes);
                  setNotesOpen(true);
                  return;
                }
                void fetchPatchNotes().then((n) => {
                  setNotes(n);
                  setNotesOpen(true);
                });
              }}
            >
              View patch notes
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                void installUpdate().then((s) => {
                  setUpdate(s);
                })
              }
            >
              Install
            </button>
          </div>
        </div>
      )}

      <div className="launcher-body">
        <section className="launcher-list-pane" aria-label="Projects">
          <div className="launcher-list-header">
            <h2>Projects</h2>
            <button type="button" className="ghost" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          {loading && <p className="muted">Loading…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && projects.length === 0 && (
            <p className="muted empty-hint">
              No projects yet. Create one to start writing your GDD.
            </p>
          )}
          <ul className="launcher-project-list">
            {projects.map((project) => {
              const active = project.id === selectedId;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    className={active ? "launcher-row active" : "launcher-row"}
                    onClick={() => setSelectedId(project.id)}
                    onDoubleClick={() => void handleOpen(project)}
                  >
                    <span className="project-name">{project.name}</span>
                    <span className="muted tiny path-line">{project.path}</span>
                    <span className="muted tiny">
                      {formatOpened(project.lastOpenedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="launcher-side" aria-label="Project actions">
          <button
            type="button"
            className="primary wide"
            onClick={() => setNewOpen(true)}
          >
            New Project
          </button>
          <button
            type="button"
            className="wide"
            disabled={!selected || busyId === selected.id}
            onClick={() => selected && void handleOpen(selected)}
          >
            Edit
          </button>
          <button
            type="button"
            className="wide danger-outline"
            disabled={!selected}
            onClick={() => void handleRemove()}
          >
            Remove
          </button>

          {selected && (
            <div className="side-detail">
              <h3>{selected.name}</h3>
              <p className="muted tiny path-line">{selected.path}</p>
              <p className="muted tiny">{formatOpened(selected.lastOpenedAt)}</p>
              <p className="muted tiny">
                Double-click a row or press Edit to open the editor.
              </p>
            </div>
          )}
        </aside>
      </div>

      <NewProjectDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={handleCreate}
      />

      {optionsModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOptionsModal(false)}>
          <div
            className="modal-panel options-modal-panel"
            role="dialog"
            aria-label="Options"
            onClick={(e) => e.stopPropagation()}
          >
            <OptionsPanel asWindow onClose={() => setOptionsModal(false)} />
          </div>
        </div>
      )}

      {notesOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setNotesOpen(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-labelledby="notes-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="notes-title">Patch notes</h2>
            <pre className="patch-notes">{notes}</pre>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setNotesOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
