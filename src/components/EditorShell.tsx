import type { ProjectRecord } from "../types";
import { EditorCanvas } from "./EditorCanvas";

type EditorShellProps = {
  project: ProjectRecord;
  onBack: () => void;
};

export function EditorShell({ project, onBack }: EditorShellProps) {
  return (
    <div className="app-shell editor-mode">
      <header className="app-chrome">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>GDD Studio</h1>
        </div>
        <div className="chrome-right">
          <p className="chrome-meta muted path-line" title={project.path}>
            {project.name}
          </p>
          <button type="button" className="ghost" onClick={onBack}>
            ← Projects
          </button>
        </div>
      </header>
      <main className="main-pane editor-alone">
        <div className="doc-header">
          <h2>{project.name}</h2>
          <p className="muted status path-line">{project.path}</p>
        </div>
        <EditorCanvas projectName={project.name} />
      </main>
    </div>
  );
}
