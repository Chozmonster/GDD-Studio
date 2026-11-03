import type { ProjectSummary } from "../types";

type ProjectLibraryProps = {
  projects: ProjectSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (project: ProjectSummary) => void;
  onRefresh: () => void;
};

export function ProjectLibrary({
  projects,
  activeId,
  loading,
  error,
  onSelect,
  onRefresh,
}: ProjectLibraryProps) {
  return (
    <aside className="library" aria-label="Project library">
      <div className="library-header">
        <h2>Projects</h2>
        <button type="button" className="ghost" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && projects.length === 0 && (
        <p className="muted">No projects yet.</p>
      )}

      <ul className="project-list">
        {projects.map((project) => {
          const active = project.id === activeId;
          return (
            <li key={project.id}>
              <button
                type="button"
                className={active ? "project-item active" : "project-item"}
                onClick={() => onSelect(project)}
                aria-current={active ? "true" : undefined}
              >
                <span className="project-name">{project.name}</span>
                <span className="muted project-id">{project.id}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="library-note muted">
        Placeholder list from Rust stubs. Create / open / rename / delete arrive in v1.
      </p>
    </aside>
  );
}
