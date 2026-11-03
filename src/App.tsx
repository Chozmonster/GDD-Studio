import { useCallback, useEffect, useState } from "react";
import { fetchHealth, fetchProjects, openProject } from "./api";
import { EditorCanvas } from "./components/EditorCanvas";
import { ProjectLibrary } from "./components/ProjectLibrary";
import type { HealthStatus, ProjectSummary } from "./types";
import "./App.css";

function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [active, setActive] = useState<ProjectSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setLibraryError(null);
    try {
      const [nextHealth, nextProjects] = await Promise.all([
        fetchHealth(),
        fetchProjects(),
      ]);
      setHealth(nextHealth);
      setProjects(nextProjects);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const handleSelect = async (project: ProjectSummary) => {
    try {
      const result = await openProject(project.id);
      setActive(result.project);
      setStatusMessage(result.message);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="app-shell">
      <header className="app-chrome">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>GDD Studio</h1>
        </div>
        <p className="chrome-meta muted">
          {health
            ? `${health.app} v${health.version}${health.ok ? "" : " (unhealthy)"}`
            : "Connecting…"}
        </p>
      </header>

      <div className="workspace">
        <ProjectLibrary
          projects={projects}
          activeId={active?.id ?? null}
          loading={loading}
          error={libraryError}
          onSelect={handleSelect}
          onRefresh={() => void loadLibrary()}
        />
        <main className="main-pane">
          <div className="doc-header">
            <h2>{active?.name ?? "No project open"}</h2>
            {statusMessage && <p className="muted status">{statusMessage}</p>}
          </div>
          <EditorCanvas projectName={active?.name ?? null} />
        </main>
      </div>
    </div>
  );
}

export default App;
