import { useCallback, useState } from "react";
import { openOptionsWindow } from "../api";
import type { ProjectRecord, ProjectTab } from "../types";
import { ChartsEditor } from "./charts/ChartsEditor";
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
  if (tab === "rgd") return "rgd" as const;
  if (tab === "moodboard") return "moodboard" as const;
  if (tab === "charts") return "charts" as const;
  return "app" as const;
}

export function EditorShell({ project, onBack }: EditorShellProps) {
  const [tab, setTab] = useState<ProjectTab>("document");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusFlowchartId, setFocusFlowchartId] = useState<string | null>(null);
  const [focusSheetId, setFocusSheetId] = useState<string | null>(null);
  const [focusMoodBoardId, setFocusMoodBoardId] = useState<string | null>(null);
  const [focusChartId, setFocusChartId] = useState<string | null>(null);

  const openFlowchart = useCallback((flowchartId: string) => {
    setFocusFlowchartId(flowchartId);
    setTab("flowchart");
  }, []);

  const openRgdSheet = useCallback((sheetId: string) => {
    setFocusSheetId(sheetId);
    setTab("rgd");
  }, []);

  const openMoodBoard = useCallback((boardId?: string) => {
    setFocusMoodBoardId(boardId ?? null);
    setTab("moodboard");
  }, []);

  const openChart = useCallback((chartId?: string) => {
    setFocusChartId(chartId ?? null);
    setTab("charts");
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
          <button
            type="button"
            className={tab === "charts" ? "tab active" : "tab"}
            onClick={() => setTab("charts")}
            aria-current={tab === "charts" ? "page" : undefined}
          >
            Graph
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
          Keep every main tab mounted (hidden) so per-tab undo stacks and
          TipTap selection/cursor survive switches. Mood Board "Insert into
          document" restores the last Document cursor.
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
            active={tab === "document"}
            onOpenFlowchart={openFlowchart}
            onOpenRgdSheet={openRgdSheet}
            onOpenMoodBoard={openMoodBoard}
            onOpenChart={openChart}
          />
        </div>

        <div
          className={
            tab === "flowchart" ? "editor-tab-panel" : "editor-tab-panel is-hidden"
          }
          hidden={tab !== "flowchart"}
          aria-hidden={tab !== "flowchart"}
        >
          <FlowchartEditor
            project={project}
            active={tab === "flowchart"}
            focusFlowchartId={focusFlowchartId}
          />
        </div>

        <div
          className={
            tab === "rgd" ? "editor-tab-panel" : "editor-tab-panel is-hidden"
          }
          hidden={tab !== "rgd"}
          aria-hidden={tab !== "rgd"}
        >
          <RgdEditor
            project={project}
            active={tab === "rgd"}
            focusSheetId={focusSheetId}
            onOpenFlowchart={openFlowchart}
          />
        </div>

        <div
          className={
            tab === "moodboard" ? "editor-tab-panel" : "editor-tab-panel is-hidden"
          }
          hidden={tab !== "moodboard"}
          aria-hidden={tab !== "moodboard"}
        >
          <MoodBoard
            project={project}
            active={tab === "moodboard"}
            focusBoardId={focusMoodBoardId}
            onInsertedIntoDocument={() => setTab("document")}
          />
        </div>

        <div
          className={
            tab === "charts" ? "editor-tab-panel" : "editor-tab-panel is-hidden"
          }
          hidden={tab !== "charts"}
          aria-hidden={tab !== "charts"}
        >
          <ChartsEditor
            project={project}
            active={tab === "charts"}
            focusChartId={focusChartId}
          />
        </div>
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
