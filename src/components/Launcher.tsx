import { useCallback, useEffect, useState } from "react";
import {
  checkForUpdates,
  createProject,
  createRgdSheet,
  defaultProjectsDir,
  deleteProject,
  fetchCloudStatus,
  fetchHealth,
  fetchPatchNotes,
  fetchProjects,
  installUpdate,
  listRemoteCloudProjects,
  openOptionsWindow,
  openProject,
  openProjectFromCloud,
  pickDirectory,
  saveDocument,
  saveRgdSheet,
  syncCloudProject,
} from "../api";
import { emitRgdSheetSaved } from "../lib/rgdEvents";
import type {
  CloudStatus,
  HealthStatus,
  ProjectRecord,
  RemoteEntry,
  SyncConflict,
  UpdateStatus,
} from "../types";
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
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [openCloudOpen, setOpenCloudOpen] = useState(false);
  const [remoteProjects, setRemoteProjects] = useState<RemoteEntry[]>([]);
  const [conflicts, setConflicts] = useState<{
    projectId: string;
    items: SyncConflict[];
  } | null>(null);
  const [conflictChoices, setConflictChoices] = useState<
    Record<string, "yours" | "theirs">
  >({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, list, cloudStatus] = await Promise.all([
        fetchHealth(),
        fetchProjects(),
        fetchCloudStatus().catch(() => null),
      ]);
      setHealth(h);
      setProjects(list);
      if (cloudStatus) setCloud(cloudStatus);
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
      void fetchCloudStatus()
        .then(setCloud)
        .catch(() => undefined);
    }
  }, [optionsModal, refreshUpdates]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const handleSyncSelected = async (
    resolutions?: Record<string, string>,
  ) => {
    if (!selected) return;
    if (!cloud?.linked) {
      setCloudMsg("Link Google Drive in Options first.");
      return;
    }
    setBusyId(selected.id);
    setCloudMsg("Syncing…");
    try {
      const result = await syncCloudProject(selected.id, { resolutions });
      setCloudMsg(result.message);
      if (result.conflicts.length > 0) {
        setConflicts({ projectId: selected.id, items: result.conflicts });
        setConflictChoices({});
      } else {
        setConflicts(null);
      }
      const next = await fetchCloudStatus();
      setCloud(next);
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleResolveConflicts = async () => {
    if (!conflicts) return;
    const missing = conflicts.items.filter((c) => !conflictChoices[c.path]);
    if (missing.length > 0) {
      setCloudMsg("Pick Yours or Theirs for every conflicted file.");
      return;
    }
    const projectId = conflicts.projectId;
    setConflicts(null);
    setBusyId(projectId);
    setCloudMsg("Applying conflict choices…");
    try {
      const result = await syncCloudProject(projectId, {
        resolutions: conflictChoices,
      });
      setCloudMsg(result.message);
      if (result.conflicts.length > 0) {
        setConflicts({ projectId, items: result.conflicts });
      }
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenFromCloud = async () => {
    if (!cloud?.linked) {
      setCloudMsg("Link Google Drive in Options first.");
      return;
    }
    setBusyId("__cloud__");
    setCloudMsg(null);
    try {
      const list = await listRemoteCloudProjects();
      setRemoteProjects(list);
      setOpenCloudOpen(true);
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const downloadRemote = async (entry: RemoteEntry) => {
    setBusyId(entry.id);
    try {
      const parent =
        (await pickDirectory(await defaultProjectsDir())) ??
        (await defaultProjectsDir());
      const record = await openProjectFromCloud(entry.id, entry.name, parent);
      setOpenCloudOpen(false);
      await refresh();
      setCloudMsg(`Opened “${record.name}” from cloud.`);
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

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

          <div className="side-cloud">
            <p className="muted tiny side-cloud-label">Cloud sync</p>
            {!cloud?.linked ? (
              <button
                type="button"
                className="wide ghost"
                onClick={() => void handleOptions()}
              >
                Link cloud storage…
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="wide"
                  disabled={!selected || busyId === selected?.id}
                  onClick={() => void handleSyncSelected()}
                >
                  Sync project
                </button>
                <button
                  type="button"
                  className="wide ghost"
                  disabled={busyId === "__cloud__"}
                  onClick={() => void handleOpenFromCloud()}
                >
                  Open from cloud…
                </button>
              </>
            )}
            {cloudMsg && <p className="muted tiny cloud-msg">{cloudMsg}</p>}
            {cloud?.linked && cloud.accountLabel && (
              <p className="muted tiny path-line">{cloud.accountLabel}</p>
            )}
          </div>

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

      {openCloudOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setOpenCloudOpen(false)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-label="Open from cloud"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Open from cloud</h2>
            <p className="muted tiny">
              Projects under your Drive <code>GDD Studio</code> folder. Download
              creates a local copy and adds it to this library.
            </p>
            {remoteProjects.length === 0 ? (
              <p className="muted">No remote project folders yet. Sync one up first.</p>
            ) : (
              <ul className="cloud-remote-list">
                {remoteProjects.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="wide"
                      disabled={busyId === entry.id}
                      onClick={() => void downloadRemote(entry)}
                    >
                      {entry.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setOpenCloudOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {conflicts && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-panel"
            role="dialog"
            aria-label="Resolve sync conflicts"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Resolve conflicts</h2>
            <p className="muted tiny">
              Both sides changed since the last sync. Pick <strong>Yours</strong>{" "}
              (local) or <strong>Theirs</strong> (cloud) per file. No automatic
              merge.
            </p>
            <ul className="conflict-list">
              {conflicts.items.map((item) => (
                <li key={item.path}>
                  <code>{item.path}</code>
                  <span className="muted tiny block">
                    Local mtime:{" "}
                    {item.localMtime
                      ? new Date(item.localMtime * 1000).toLocaleString()
                      : "—"}
                    {" · "}
                    Remote: {item.remoteMtime ?? "—"}
                  </span>
                  <div className="options-actions">
                    <button
                      type="button"
                      className={
                        conflictChoices[item.path] === "yours" ? "primary" : "ghost"
                      }
                      onClick={() =>
                        setConflictChoices((prev) => ({
                          ...prev,
                          [item.path]: "yours",
                        }))
                      }
                    >
                      Yours
                    </button>
                    <button
                      type="button"
                      className={
                        conflictChoices[item.path] === "theirs"
                          ? "primary"
                          : "ghost"
                      }
                      onClick={() =>
                        setConflictChoices((prev) => ({
                          ...prev,
                          [item.path]: "theirs",
                        }))
                      }
                    >
                      Theirs
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setConflicts(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleResolveConflicts()}
              >
                Apply &amp; sync
              </button>
            </div>
          </div>
        </div>
      )}

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
