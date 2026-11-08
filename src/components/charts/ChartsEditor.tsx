import { useCallback, useEffect, useRef, useState } from "react";
import { listCharts, loadChart, saveChart } from "../../api";
import {
  useHistoryStack,
  type PushHistoryOptions,
} from "../../hooks/useHistoryStack";
import { emitChartSaved } from "../../lib/chartEvents";
import { generatePowerCurve } from "../../lib/chartFormula";
import { undoRedoFromKeyboard } from "../../lib/undoKeyboard";
import type { ChartDocument, ProjectRecord } from "../../types";
import { UndoRedoButtons } from "../editor/UndoRedoButtons";
import { SplitPane } from "../SplitPane";
import { ChartDataTable } from "./ChartDataTable";
import {
  cloneChart,
  emptyChartDocument,
  newEntityId,
  normalizeChart,
} from "./chartModel";
import { ChartPreview } from "./ChartPreview";
import { ChartsSidebar } from "./ChartsSidebar";

type ChartsEditorProps = {
  project: ProjectRecord;
  /** When false, this tab is hidden — skip window keyboard undo handling. */
  active?: boolean;
  /** When set (e.g. from a document embed Open), select that chart. */
  focusChartId?: string | null;
};

type FormulaState = {
  a: string;
  b: string;
  c: string;
  xStart: string;
  xEnd: string;
  seriesId: string;
  replaceRows: boolean;
};

const defaultFormula = (seriesId: string): FormulaState => ({
  a: "100",
  b: "1.5",
  c: "0",
  xStart: "1",
  xEnd: "20",
  seriesId,
  replaceRows: true,
});

export function ChartsEditor({
  project,
  active = true,
  focusChartId,
}: ChartsEditorProps) {
  const [chartId, setChartId] = useState("main");
  const [chartName, setChartName] = useState("Main");
  const [doc, setDoc] = useState<ChartDocument>(() => emptyChartDocument());
  const [status, setStatus] = useState("Loading…");
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [formula, setFormula] = useState<FormulaState>(() =>
    defaultFormula("series-1"),
  );
  const docRef = useRef(doc);
  const chartIdRef = useRef(chartId);
  const saveTimer = useRef<number | null>(null);
  const applyingHistory = useRef(false);
  const {
    push: pushHistory,
    undo: undoHistory,
    redo: redoHistory,
    clear: clearHistory,
    canUndo,
    canRedo,
  } = useHistoryStack<ChartDocument>();

  docRef.current = doc;
  chartIdRef.current = chartId;

  const selectChart = useCallback((id: string, name: string) => {
    setChartId(id);
    setChartName(name);
    setFormulaOpen(false);
  }, []);

  const persist = useCallback(
    async (next: ChartDocument) => {
      const id = chartIdRef.current;
      const saved = await saveChart(project.id, id, next);
      setDoc(saved);
      docRef.current = saved;
      setChartName(saved.name);
      emitChartSaved(project.id, id, saved);
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
    },
    [project.id],
  );

  const schedulePersist = useCallback(
    (next: ChartDocument) => {
      const id = chartIdRef.current;
      const normalized = normalizeChart(next);
      setDoc(normalized);
      docRef.current = normalized;
      emitChartSaved(project.id, id, normalized);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(normalized).catch((e) =>
          setStatus(e instanceof Error ? e.message : String(e)),
        );
      }, 350);
    },
    [persist, project.id],
  );

  const recordHistory = useCallback(
    (opts?: PushHistoryOptions) => {
      if (applyingHistory.current) return;
      pushHistory(cloneChart(docRef.current), opts);
    },
    [pushHistory],
  );

  const applySnapshot = useCallback(
    (snap: ChartDocument) => {
      applyingHistory.current = true;
      schedulePersist(cloneChart(snap));
      setChartName(snap.name || chartName);
      applyingHistory.current = false;
    },
    [chartName, schedulePersist],
  );

  const handleUndo = useCallback(() => {
    const prev = undoHistory(cloneChart(docRef.current));
    if (!prev) return;
    applySnapshot(prev);
    setStatus("Undid last chart edit");
  }, [undoHistory, applySnapshot]);

  const handleRedo = useCallback(() => {
    const next = redoHistory(cloneChart(docRef.current));
    if (!next) return;
    applySnapshot(next);
    setStatus("Redid chart edit");
  }, [redoHistory, applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listCharts(project.id);
      if (cancelled) return;
      if (focusChartId && list.some((c) => c.id === focusChartId)) {
        const found = list.find((c) => c.id === focusChartId)!;
        selectChart(found.id, found.name);
        return;
      }
      if (list[0]) selectChart(list[0].id, list[0].name);
      else selectChart("main", "Main");
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, selectChart]);

  useEffect(() => {
    if (!focusChartId) return;
    void listCharts(project.id).then((list) => {
      const found = list.find((c) => c.id === focusChartId);
      if (found) selectChart(found.id, found.name);
    });
  }, [focusChartId, project.id, selectChart]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("Loading…");
      try {
        const loaded = normalizeChart(await loadChart(project.id, chartId));
        if (cancelled) return;
        setDoc(loaded);
        docRef.current = loaded;
        setChartName(loaded.name);
        setFormula(defaultFormula(loaded.series[0]?.id ?? "series-1"));
        clearHistory();
        setStatus("Ready");
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, chartId, clearHistory]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const action = undoRedoFromKeyboard(e);
      if (!action) return;
      // Own form-level history — override native input undo while this tab is active.
      if (action === "undo" && canUndo) {
        e.preventDefault();
        handleUndo();
      } else if (action === "redo" && canRedo) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, canUndo, canRedo, handleUndo, handleRedo]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const applyField = <K extends keyof ChartDocument>(
    key: K,
    value: ChartDocument[K],
    historyOpts?: PushHistoryOptions,
  ) => {
    recordHistory(historyOpts);
    schedulePersist({ ...docRef.current, [key]: value });
  };

  const runFormula = () => {
    const a = Number(formula.a);
    const b = Number(formula.b);
    const c = Number(formula.c || 0);
    const xStart = Number(formula.xStart);
    const xEnd = Number(formula.xEnd);
    if (![a, b, c, xStart, xEnd].every(Number.isFinite)) {
      setStatus("Formula needs numeric a, b, c, xStart, xEnd");
      return;
    }
    const points = generatePowerCurve({ a, b, c, xStart, xEnd });
    if (points.length === 0) {
      setStatus("Formula produced no points");
      return;
    }
    recordHistory();
    const current = cloneChart(docRef.current);
    let seriesId = formula.seriesId;
    if (!current.series.some((s) => s.id === seriesId)) {
      seriesId = current.series[0]?.id ?? newEntityId("series");
      if (!current.series.some((s) => s.id === seriesId)) {
        current.series = [
          ...current.series,
          { id: seriesId, name: "Generated" },
        ];
      }
    }
    const yFor = (y: number) => {
      const map: Record<string, number | null> = {};
      for (const s of current.series) {
        map[s.id] = s.id === seriesId ? y : null;
      }
      return map;
    };
    if (formula.replaceRows) {
      current.rows = points.map((p) => ({
        id: newEntityId("row"),
        x: p.x,
        y: yFor(p.y),
      }));
    } else {
      const byX = new Map(current.rows.map((r) => [String(r.x), r]));
      for (const p of points) {
        const key = String(p.x);
        const existing = byX.get(key);
        if (existing) {
          existing.y = { ...existing.y, [seriesId]: p.y };
        } else {
          const row = {
            id: newEntityId("row"),
            x: p.x,
            y: yFor(p.y),
          };
          current.rows.push(row);
          byX.set(key, row);
        }
      }
      current.rows.sort((a, b) => {
        const an = typeof a.x === "number" ? a.x : Number(a.x);
        const bn = typeof b.x === "number" ? b.x : Number(b.x);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.x).localeCompare(String(b.x));
      });
    }
    schedulePersist(current);
    setStatus(`Generated ${points.length} points (a·x^b + c)`);
    setFormulaOpen(false);
  };

  return (
    <div className="flowchart-shell charts-shell">
      <SplitPane
        id="charts.sidebar"
        defaultSize={220}
        minSize={160}
        maxSize={360}
        minSecondary={320}
        stackBelow={840}
      >
        <ChartsSidebar
          project={project}
          activeId={chartId}
          onSelect={selectChart}
        />
        <div className="flowchart-main charts-main">
          <header className="flowchart-toolbar charts-toolbar">
            <div className="flowchart-toolbar-left">
              <h2>{chartName}</h2>
              <p className="muted tiny flowchart-status" role="status">
                {status}
              </p>
            </div>
            <div className="flowchart-toolbar-actions">
              <UndoRedoButtons
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
              <label className="charts-inline-field">
                <span className="muted tiny">Type</span>
                <select
                  value={doc.chartType}
                  onChange={(e) =>
                    applyField(
                      "chartType",
                      e.target.value === "bar" ? "bar" : "line",
                    )
                  }
                >
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                </select>
              </label>
              <button
                type="button"
                className="ghost tiny-btn"
                onClick={() => {
                  setFormula((f) => ({
                    ...f,
                    seriesId: doc.series[0]?.id ?? f.seriesId,
                  }));
                  setFormulaOpen((o) => !o);
                }}
              >
                Formula…
              </button>
            </div>
          </header>

          <div className="charts-meta-row">
            <label className="charts-inline-field grow">
              <span className="muted tiny">Description</span>
              <input
                value={doc.description}
                placeholder="Optional note under embeds"
                onChange={(e) =>
                  applyField("description", e.target.value, { coalesce: true })
                }
              />
            </label>
            <label className="charts-inline-field">
              <span className="muted tiny">X label</span>
              <input
                value={doc.xLabel}
                onChange={(e) =>
                  applyField("xLabel", e.target.value, { coalesce: true })
                }
              />
            </label>
            <label className="charts-inline-field">
              <span className="muted tiny">Y label</span>
              <input
                value={doc.yLabel}
                onChange={(e) =>
                  applyField("yLabel", e.target.value, { coalesce: true })
                }
              />
            </label>
          </div>

          {formulaOpen && (
            <div className="charts-formula-panel" role="dialog" aria-label="Generate from formula">
              <p className="muted tiny">
                Fill a series with <code>y = a · x^b + c</code> (RPG curve helper — not a full formula engine).
              </p>
              <div className="charts-formula-grid">
                <label>
                  a
                  <input
                    value={formula.a}
                    onChange={(e) =>
                      setFormula((f) => ({ ...f, a: e.target.value }))
                    }
                  />
                </label>
                <label>
                  b
                  <input
                    value={formula.b}
                    onChange={(e) =>
                      setFormula((f) => ({ ...f, b: e.target.value }))
                    }
                  />
                </label>
                <label>
                  c
                  <input
                    value={formula.c}
                    onChange={(e) =>
                      setFormula((f) => ({ ...f, c: e.target.value }))
                    }
                  />
                </label>
                <label>
                  x start
                  <input
                    value={formula.xStart}
                    onChange={(e) =>
                      setFormula((f) => ({ ...f, xStart: e.target.value }))
                    }
                  />
                </label>
                <label>
                  x end
                  <input
                    value={formula.xEnd}
                    onChange={(e) =>
                      setFormula((f) => ({ ...f, xEnd: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Series
                  <select
                    value={formula.seriesId}
                    onChange={(e) =>
                      setFormula((f) => ({ ...f, seriesId: e.target.value }))
                    }
                  >
                    {doc.series.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="charts-formula-replace">
                <input
                  type="checkbox"
                  checked={formula.replaceRows}
                  onChange={(e) =>
                    setFormula((f) => ({
                      ...f,
                      replaceRows: e.target.checked,
                    }))
                  }
                />
                Replace all rows
              </label>
              <div className="charts-formula-actions">
                <button
                  type="button"
                  className="primary tiny-btn"
                  onClick={runFormula}
                >
                  Generate
                </button>
                <button
                  type="button"
                  className="ghost tiny-btn"
                  onClick={() => setFormulaOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="charts-workspace">
            <ChartPreview document={doc} />
            <ChartDataTable
              document={doc}
              onBeforeChange={recordHistory}
              onChange={schedulePersist}
            />
          </div>
        </div>
      </SplitPane>
    </div>
  );
}
