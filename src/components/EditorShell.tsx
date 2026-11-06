import { useCallback, useState } from "react";
import { openOptionsWindow } from "../api";
import type { ProjectRecord, ProjectTab } from "../types";
import { EditorCanvas } from "./EditorCanvas";
import { FlowchartEditor } from "./flowchart/FlowchartEditor";
import { HelpPanel } from "./help/HelpPanel";
import { MoodBoard } from "./moodboard/MoodBoard";
import { OptionsPanel } from "./OptionsPanel";
import { RgdEditor } from "./rgd/RgdEditor";

type EditorShellProps = {
  project: ProjectRecord;
  onBack: () => void;
};

function helpSectionForTab(tab: ProjectTab) {
  if (tab === "rgd") return "rgd-overview" as const;
  if (tab === "moodboard") return "moodboard" as const;
  return "app" as const;
}

export function EditorShell({ project, onBack }: EditorShellProps) {
  const [tab, setTab] = useState<ProjectTab>("document");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusFlowchartId, setFocusFlowchartId] = useState<string | null>(null);
  const [focusSheetId, setFocusSheetId] = useState<string | null>(null);

  const openFlowchart = useCallback((flowchartId: string) => {
    setFocusFlowchartId(flowchartId);
    setTab("flowchart");
  }, []);

  const openRgdSheet = useCallback((sheetId: string) => {
    setFocusSheetId(sheetId);
    setTab("rgd");
  }, []);

  const openMoodBoard = useCallback(() => {
    setTab("moodboard");
  }, []);

  const handleOptions = async () => {
    try {
      await openOptionsWindow();
    } catch {
      setOptionsOpen(true);
    }
  };

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
          <button
            type="button"
            className={tab === "rgd" ? "tab active" : "tab"}
            onClick={() => setTab("rgd")}
            aria-current={tab === "rgd" ? "page" : undefined}
          >
            RGD
          </button>
          <button
            type="button"
            className={tab === "moodboard" ? "tab active" : "tab"}
            onClick={() => setTab("moodboard")}
            aria-current={tab === "moodboard" ? "page" : undefined}
          >
            Mood Board
          </button>
        </nav>
        <div className="chrome-right">
          <p className="chrome-meta muted path-line" title={project.path}>
            {project.name}
          </p>
          <button type="button" className="ghost" onClick={() => setHelpOpen(true)}>
            Help
          </button>
          <button type="button" className="ghost" onClick={() => void handleOptions()}>
            Options
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            ← Projects
          </button>
        </div>
      </header>
      <main className="main-pane editor-alone">
        {/*
          Keep Document mounted (hidden) so TipTap selection/cursor survives
          tab switches — Mood Board "Insert into document" restores that position.
        */}
        <div
          className={
            tab === "document" ? "editor-tab-panel" : "editor-tab-panel is-hidden"
          }
          hidden={tab !== "document"}
          aria-hidden={tab !== "document"}
        >
          <div className="doc-header">
            <h2>{project.name}</h2>
            <p className="muted status path-line">{project.path}</p>
          </div>
          <EditorCanvas
            project={project}
            onOpenFlowchart={openFlowchart}
            onOpenRgdSheet={openRgdSheet}
            onOpenMoodBoard={openMoodBoard}
          />
        </div>

        {tab === "flowchart" && (
          <FlowchartEditor
            project={project}
            focusFlowchartId={focusFlowchartId}
          />
        )}
        {tab === "rgd" && (
          <RgdEditor
            project={project}
            focusSheetId={focusSheetId}
            onOpenFlowchart={openFlowchart}
          />
        )}
        {tab === "moodboard" && (
          <MoodBoard
            project={project}
            onInsertedIntoDocument={() => setTab("document")}
          />
        )}
      </main>

      {optionsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setOptionsOpen(false)}
        >
          <div
            className="modal-panel options-modal-panel"
            role="dialog"
            aria-label="Options"
            onClick={(e) => e.stopPropagation()}
          >
            <OptionsPanel
              asWindow
              project={project}
              onClose={() => setOptionsOpen(false)}
            />
          </div>
        </div>
      )}

      <HelpPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        initialSection={helpSectionForTab(tab)}
      />
    </div>
  );
}
