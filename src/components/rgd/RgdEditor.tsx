import { useCallback, useEffect, useRef, useState } from "react";
import {
  listFlowcharts,
  listRgdSheets,
  loadRgdSheet,
  saveRgdSheet,
} from "../../api";
import { emitRgdSheetSaved } from "../../lib/rgdEvents";
import type { FlowchartSummary, ProjectRecord, RgdSheetDocument } from "../../types";
import { RgdStepFields } from "../editor/rgd/RgdStepFields";
import {
  getSheetStep,
  normalizeRgdSheet,
  setSheetStep,
} from "../editor/rgd/rgdSheetModel";
import type { RgdBlockType, RgdPayloadByType } from "../editor/rgd/rgdTypes";
import { RGD_INSERT_ORDER, RGD_TYPE_META } from "../editor/rgd/rgdTypes";
import { RgdSidebar } from "./RgdSidebar";

type RgdEditorProps = {
  project: ProjectRecord;
  focusSheetId?: string | null;
  onOpenFlowchart?: (flowchartId: string) => void;
};

export function RgdEditor({
  project,
  focusSheetId,
  onOpenFlowchart,
}: RgdEditorProps) {
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState<RgdSheetDocument | null>(null);
  const [activeStep, setActiveStep] = useState<RgdBlockType>("pillars");
  const [status, setStatus] = useState("Loading…");
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);
  const saveTimer = useRef<number | null>(null);
  const docRef = useRef<RgdSheetDocument | null>(null);

  const selectSheet = useCallback((id: string, sheetName: string) => {
    if (!id) {
      setSheetId(null);
      setName("");
      setDoc(null);
      docRef.current = null;
      setStatus("No sheet selected");
      return;
    }
    setSheetId(id);
    setName(sheetName);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listRgdSheets(project.id);
      if (cancelled) return;
      if (focusSheetId && list.some((s) => s.id === focusSheetId)) {
        const found = list.find((s) => s.id === focusSheetId)!;
        selectSheet(found.id, found.name);
        return;
      }
      if (list[0]) selectSheet(list[0].id, list[0].name);
      else {
        selectSheet("", "");
        setStatus("Create a sheet to begin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, selectSheet]);

  useEffect(() => {
    if (!focusSheetId) return;
    void listRgdSheets(project.id).then((list) => {
      const found = list.find((s) => s.id === focusSheetId);
      if (found) selectSheet(found.id, found.name);
    });
  }, [focusSheetId, project.id, selectSheet]);

  useEffect(() => {
    void listFlowcharts(project.id).then(setFlowcharts);
  }, [project.id]);

  useEffect(() => {
    if (!sheetId) return;
    let cancelled = false;
    void (async () => {
      setStatus("Loading…");
      try {
        const loaded = normalizeRgdSheet(
          await loadRgdSheet(project.id, sheetId),
        );
        if (cancelled) return;
        setDoc(loaded);
        docRef.current = loaded;
        setName(loaded.name);
        setStatus("Ready");
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [project.id, sheetId]);

  const persist = useCallback(
    async (next: RgdSheetDocument) => {
      if (!sheetId) return;
      await saveRgdSheet(project.id, sheetId, next);
      emitRgdSheetSaved(project.id, sheetId, next);
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
    },
    [project.id, sheetId],
  );

  const queueSave = useCallback(
    (next: RgdSheetDocument) => {
      docRef.current = next;
      setDoc(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next).catch((e) =>
          setStatus(e instanceof Error ? e.message : String(e)),
        );
      }, 450);
    },
    [persist],
  );

  const updateName = (nextName: string) => {
    if (!doc) return;
    queueSave({ ...doc, name: nextName });
    setName(nextName);
  };

  const updatePrimaryFlowchart = (flowchartId: string) => {
    if (!doc) return;
    queueSave({ ...doc, primaryFlowchartId: flowchartId });
  };

  const updateStepPayload = <T extends RgdBlockType>(
    type: T,
    payload: RgdPayloadByType[T],
  ) => {
    if (!doc) return;
    const step = getSheetStep(doc, type);
    queueSave(setSheetStep(doc, type, { ...step, payload }));
  };

  const updateStepTitle = (type: RgdBlockType, title: string) => {
    if (!doc) return;
    const step = getSheetStep(doc, type);
    queueSave(setSheetStep(doc, type, { ...step, title }));
  };

  const meta = RGD_TYPE_META[activeStep];
  const active = doc ? getSheetStep(doc, activeStep) : null;

  return (
    <div className="flowchart-shell rgd-shell">
      <RgdSidebar
        project={project}
        activeId={sheetId}
        onSelect={selectSheet}
      />
      <div className="flowchart-main rgd-main">
        {!sheetId || !doc || !active ? (
          <div className="rgd-empty-state">
            <h2>RGD</h2>
            <p className="muted">
              Create a sheet for one gameplay loop, then fill the seven design
              steps. Embed a compact card in the Document when you want a
              reference.
            </p>
            <p className="muted tiny">{status}</p>
          </div>
        ) : (
          <>
            <header className="rgd-editor-toolbar">
              <div className="rgd-editor-title-row">
                <input
                  className="rgd-sheet-name-input"
                  value={name}
                  aria-label="Sheet name"
                  onChange={(e) => updateName(e.target.value)}
                />
                <span className="muted tiny toolbar-status">{status}</span>
              </div>
              <label className="rgd-field rgd-primary-flow">
                <span>Primary flowchart</span>
                <div className="rgd-flowchart-row">
                  <select
                    value={doc.primaryFlowchartId}
                    aria-label="Primary flowchart"
                    onChange={(e) => updatePrimaryFlowchart(e.target.value)}
                  >
                    <option value="">None</option>
                    {flowcharts.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ghost tiny-btn"
                    disabled={!doc.primaryFlowchartId}
                    onClick={() =>
                      doc.primaryFlowchartId &&
                      onOpenFlowchart?.(doc.primaryFlowchartId)
                    }
                  >
                    Open
                  </button>
                </div>
              </label>
            </header>

            <div className="rgd-editor-body">
              <nav className="rgd-step-map" aria-label="RGD step map">
                <h3>Steps</h3>
                <ol>
                  {RGD_INSERT_ORDER.map((type) => {
                    const stepMeta = RGD_TYPE_META[type];
                    return (
                      <li key={type}>
                        <button
                          type="button"
                          className={
                            type === activeStep
                              ? "rgd-step-map-btn active"
                              : "rgd-step-map-btn"
                          }
                          onClick={() => setActiveStep(type)}
                        >
                          <span className="rgd-step-map-num">
                            {stepMeta.step}
                          </span>
                          <span className="rgd-step-map-label">
                            {stepMeta.shortLabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              <section
                className="rgd-step-panel"
                aria-label={`${meta.label} editor`}
              >
                <header className="rgd-step-panel-header">
                  <span className="rgd-step-badge">
                    RGD {meta.step} · {meta.shortLabel}
                  </span>
                  <input
                    className="rgd-title-input"
                    value={active.title}
                    aria-label={`${meta.label} title`}
                    onChange={(e) =>
                      updateStepTitle(activeStep, e.target.value)
                    }
                  />
                </header>
                <p className="rgd-hint muted tiny">{meta.description}</p>
                <RgdStepFields
                  rgdType={activeStep}
                  payload={active.payload}
                  onChange={(payload) =>
                    updateStepPayload(activeStep, payload)
                  }
                  projectId={project.id}
                  onOpenFlowchart={onOpenFlowchart}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
