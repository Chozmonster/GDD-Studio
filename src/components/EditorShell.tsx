import { useState } from "react";
import type { ProjectRecord, ProjectTab } from "../types";
import { EditorCanvas } from "./EditorCanvas";
import { FlowchartEditor } from "./flowchart/FlowchartEditor";

type EditorShellProps = {
  project: ProjectRecord;
  onBack: () => void;
};

export function EditorShell({ project, onBack }: EditorShellProps) {
  const [tab, setTab] = useState<ProjectTab>("document");

  return (
    <div className="app-shell editor-mode">
      <header className="app-chrome">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>GDD Studio</h1>
        </div>
        <nav className="project-tabs" aria-label="Project sections">
          <button
            type="button"
            className={tab === "document" ? "tab active" : "tab"}
            onClick={() => setTab("document")}
            aria-current={tab === "document" ? "page" : undefined}
          >
            Document
          </button>
          <button
            type="button"
            className={tab === "flowchart" ? "tab active" : "tab"}
            onClick={() => setTab("flowchart")}
            aria-current={tab === "flowchart" ? "page" : undefined}
          >
            Flowcharts
          </button>
        </nav>
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
        {tab === "document" ? (
          <>
            <div className="doc-header">
              <h2>{project.name}</h2>
              <p className="muted status path-line">{project.path}</p>
            </div>
            <EditorCanvas projectName={project.name} />
          </>
        ) : (
          <FlowchartEditor project={project} />
        )}
      </main>
    </div>
  );
}
