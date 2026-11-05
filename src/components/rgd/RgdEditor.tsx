import { useCallback, useEffect, useRef, useState } from "react";
import {
  listFlowcharts,
  listRgdSheets,
  loadRgdSheet,
  saveRgdSheet,
} from "../../api";
import { emitRgdSheetSaved } from "../../lib/rgdEvents";
import type { FlowchartSummary, ProjectRecord, RgdSheetDocument } from "../../types";
import { RgdLiveTable } from "../editor/rgd/RgdLiveTable";
import { RgdSheetForm } from "../editor/rgd/RgdSheetForm";
import { normalizeRgdSheet } from "../editor/rgd/rgdSheetModel";
import {
  parseMechanics,
  parseSheetMeta,
  type RgdMechanicNode,
  type RgdSheetMeta,
} from "../editor/rgd/rgdTableModel";
import { SplitPane } from "../SplitPane";
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

  const updateMechanics = (mechanics: RgdMechanicNode[]) => {
    if (!doc) return;
    queueSave({ ...doc, mechanics });
  };

  const updateMeta = (meta: RgdSheetMeta) => {
    if (!doc) return;
    queueSave({ ...doc, meta });
  };

  const mechanics = parseMechanics(doc?.mechanics);
  const meta = parseSheetMeta(doc?.meta);

  return (
    <div className="flowchart-shell rgd-shell">
      <SplitPane
        id="rgd.sidebar"
        defaultSize={210}
        minSize={140}
        maxSize={420}
        minSecondary={320}
        stackBelow={840}
        className="rgd-split"
      >
        <RgdSidebar
          project={project}
          activeId={sheetId}
          onSelect={selectSheet}
        />
        <div className="flowchart-main rgd-main">
          {!sheetId || !doc ? (
            <div className="rgd-empty-state">
              <h2>RGD</h2>
              <p className="muted">
                Create a sheet for one gameplay loop, then fill the mechanic →
                skill → parameter table. Embed a live table in the Document when
                you want it visible in the GDD.
              </p>
              <p className="muted tiny">{status}</p>
            </div>
          ) : (
            <>
              <header className="rgd-editor-toolbar">
                <div className="rgd-editor-title-row">
                  <label className="rgd-field grow rgd-gameplay-name-field">
                    <span>Gameplay name</span>
                    <input
                      className="rgd-sheet-name-input"
                      value={name}
                      aria-label="Gameplay name"
                      placeholder="e.g. Platforming"
                      onChange={(e) => updateName(e.target.value)}
                    />
                  </label>
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

              <div className="rgd-editor-body rgd-editor-body-form">
                <SplitPane
                  id="rgd.preview"
                  primary="end"
                  defaultSize={360}
                  minSize={220}
                  maxSize={720}
                  minSecondary={280}
                  stackBelow={720}
                  className="rgd-body-split"
                >
                  <section
                    className="rgd-form-panel"
                    aria-label="RGD sheet form"
                  >
                    <RgdSheetForm
                      mechanics={mechanics}
                      meta={meta}
                      onMechanicsChange={updateMechanics}
                      onMetaChange={updateMeta}
                      flowcharts={flowcharts}
                      onOpenFlowchart={onOpenFlowchart}
                    />
                  </section>
                  <aside
                    className="rgd-preview-panel"
                    aria-label="Live table preview"
                  >
                    <h3 className="rgd-preview-heading">Document preview</h3>
                    <RgdLiveTable title={name} mechanics={mechanics} />
                  </aside>
                </SplitPane>
              </div>
            </>
          )}
        </div>
      </SplitPane>
    </div>
  );
}
