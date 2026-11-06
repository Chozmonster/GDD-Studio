import { useEffect, useState } from "react";
import {
  checkForUpdates,
  fetchActiveProject,
  fetchPatchNotes,
  fetchSettings,
  revealProjectFolder,
  setAutomaticUpdates,
  setDisplayVariableNames,
} from "../api";
import { emitSettingsChanged } from "../lib/settingsEvents";
import type { AppSettings, ProjectRecord, UpdateStatus } from "../types";

type OptionsPanelProps = {
  asWindow?: boolean;
  onClose?: () => void;
  /** When known (editor modal), prefer this project for Open project folder. */
  project?: ProjectRecord | null;
};

export function OptionsPanel({ asWindow, onClose, project }: OptionsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(
    project ?? null,
  );

  useEffect(() => {
    void fetchSettings()
      .then(setSettings)
      .catch((e) => setStatus(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (project) {
      setActiveProject(project);
      return;
    }
    let cancelled = false;
    void fetchActiveProject()
      .then((active) => {
        if (!cancelled) setActiveProject(active);
      })
      .catch(() => {
        if (!cancelled) setActiveProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const applySettings = (next: AppSettings) => {
    setSettings(next);
    emitSettingsChanged(next);
  };

  const toggleAuto = async (enabled: boolean) => {
    setBusy(true);
    try {
      const next = await setAutomaticUpdates(enabled);
      applySettings(next);
      setStatus(
        enabled
          ? "Automatic updates enabled — checks about once per day."
          : "Automatic updates off — you'll be notified in the launcher.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleDisplayNames = async (enabled: boolean) => {
    setBusy(true);
    try {
      const next = await setDisplayVariableNames(enabled);
      applySettings(next);
      setStatus(
        enabled
          ? "Variable chips show name and value in the document."
          : "Variable chips show the value; hover for the name.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runCheck = async () => {
    setBusy(true);
    setNotes(null);
    try {
      const result: UpdateStatus = await checkForUpdates(true);
      setStatus(result.message);
      if (result.notes) {
        setNotes(result.notes);
      } else if (result.state === "upToDate" || result.state === "available") {
        // Updater may omit body on some paths — fall back to cached / GitHub notes.
        try {
          setNotes(await fetchPatchNotes());
        } catch {
          /* status message already set */
        }
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const showNotes = async () => {
    setBusy(true);
    try {
      setNotes(await fetchPatchNotes());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async () => {
    setBusy(true);
    try {
      await revealProjectFolder(activeProject?.id);
      setStatus(
        activeProject
          ? `Opened folder for “${activeProject.name}” in your file manager.`
          : "Opened project folder.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={asWindow ? "options-window" : "options-modal-inner"}>
      <header className="options-header">
        <h2>Options</h2>
        {onClose && (
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        )}
      </header>

      <section className="options-section">
        <h3>Project</h3>
        <p className="muted tiny options-section-lead">
          Projects live as ordinary folders on disk. Open the folder to back up
          or copy it yourself (Dropbox, Drive, USB, etc.) — there is no in-app
          cloud sync.
        </p>
        <div className="options-actions">
          <button
            type="button"
            onClick={() => void openFolder()}
            disabled={busy || !activeProject}
            title={
              activeProject ? activeProject.path : "Open a project first"
            }
          >
            Open project folder
          </button>
        </div>
        {activeProject ? (
          <p className="muted tiny path-line" title={activeProject.path}>
            {activeProject.path}
          </p>
        ) : (
          <p className="muted tiny">Open a project first to enable this.</p>
        )}
      </section>

      <section className="options-section">
        <h3>Document</h3>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.displayVariableNames ?? false}
            disabled={!settings || busy}
            onChange={(e) => void toggleDisplayNames(e.target.checked)}
          />
          <span>
            <strong>Display variable names in document</strong>
            <span className="muted block">
              When off, chips show the resolved value and the name appears on
              hover. When on, chips show both the name and the value.
            </span>
          </span>
        </label>
      </section>

      <section className="options-section">
        <h3>Updates</h3>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.automaticUpdates ?? true}
            disabled={!settings || busy}
            onChange={(e) => void toggleAuto(e.target.checked)}
          />
          <span>
            <strong>Automatic updates</strong>
            <span className="muted block">
              When on, check about once per day and install quietly when a signed
              GitHub Release is available. When off, the launcher notifies you
              with an Install button.
            </span>
          </span>
        </label>

        <div className="options-actions">
          <button type="button" onClick={() => void runCheck()} disabled={busy}>
            Check for updates
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void showNotes()}
            disabled={busy}
          >
            View patch notes
          </button>
        </div>

        {status && <p className="options-status muted">{status}</p>}
        {notes && (
          <pre className="patch-notes" tabIndex={0} aria-label="Release patch notes">
            {notes}
          </pre>
        )}

        <p className="muted tiny">
          Updates use the Tauri updater against{" "}
          <code>Chozmonster/GDD-Studio</code> GitHub Releases (
          <code>latest.json</code> + signed artifacts). Patch notes come from the
          GitHub Release body (CHANGELOG section for that tag). Demo without
          releases: <code>GDD_STUDIO_SIMULATE_UPDATE=1</code>.
        </p>
      </section>
    </div>
  );
}
