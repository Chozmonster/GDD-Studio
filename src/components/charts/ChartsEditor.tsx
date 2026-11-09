import { useCallback, useEffect, useRef, useState } from "react";
import { listCharts, loadChart, saveChart } from "../../api";
import {
  useHistoryStack,
  type PushHistoryOptions,
} from "../../hooks/useHistoryStack";
import { emitChartSaved } from "../../lib/chartEvents";
import {
  CHART_INDEPENDENT_VAR,
  evaluateFormulaSweep,
  type FormulaPresetAxisDefaults,
} from "../../lib/chartFormula";
import { undoRedoFromKeyboard } from "../../lib/undoKeyboard";
import type { ChartDocument, ProjectRecord } from "../../types";
import { UndoRedoButtons } from "../editor/UndoRedoButtons";
import { SplitPane } from "../SplitPane";
import { ChartDataTable } from "./ChartDataTable";
import {
  ChartFormulaPanel,
  defaultChartFormulaState,
  type ChartFormulaState,
} from "./ChartFormulaPanel";
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

function parseDomainNumber(raw: string, fallback: number): number | null {
  const t = raw.trim();
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function bindingsFromState(
  state: ChartFormulaState,
): { ok: true; vars: Record<string, number> } | { ok: false; error: string } {
  const vars: Record<string, number> = {};
  for (const v of state.variables) {
    const n = Number(v.value.trim());
    if (!Number.isFinite(n)) {
      return { ok: false, error: `Variable “${v.name}” needs a numeric value` };
    }
    vars[v.name] = n;
  }
  return { ok: true, vars };
}

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
  const [formula, setFormula] = useState<ChartFormulaState>(() =>
    defaultChartFormulaState("series-1"),
  );
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [formulaHint, setFormulaHint] = useState<string | null>(null);
  const docRef = useRef(doc);
  const chartIdRef = useRef(chartId);
  const formulaRef = useRef(formula);
  const saveTimer = useRef<number | null>(null);
  const formulaTimer = useRef<number | null>(null);
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
  formulaRef.current = formula;

  const selectChart = useCallback((id: string, name: string) => {
    setChartId(id);
    setChartName(name);
    setFormulaOpen(false);
    setFormulaError(null);
    setFormulaHint(null);
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

  const applyFormulaToDoc = useCallback(
    (
      state: ChartFormulaState,
      opts?: { coalesce?: boolean; source?: "live" | "apply" },
    ): boolean => {
      const xStart = parseDomainNumber(state.xStart, 1);
      const xEnd = parseDomainNumber(state.xEnd, 20);
      const step = parseDomainNumber(state.step, 1);
      if (xStart === null || xEnd === null || step === null) {
        setFormulaError("x start, x end, and step must be numbers");
        setFormulaHint(null);
        return false;
      }
      if (step === 0) {
        setFormulaError("step cannot be 0");
        setFormulaHint(null);
        return false;
      }
      const bound = bindingsFromState(state);
      if (!bound.ok) {
        setFormulaError(bound.error);
        setFormulaHint(null);
        return false;
      }
      const result = evaluateFormulaSweep({
        expression: state.expression,
        variables: bound.vars,
        xStart,
        xEnd,
        step,
        independent: CHART_INDEPENDENT_VAR,
      });
      if (!result.ok) {
        setFormulaError(result.error);
        setFormulaHint(null);
        return false;
      }

      recordHistory(opts?.coalesce ? { coalesce: true } : undefined);
      const current = cloneChart(docRef.current);
      let seriesId = state.seriesId;
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
      if (state.replaceRows) {
        current.rows = result.points.map((p) => ({
          id: newEntityId("row"),
          x: p.x,
          y: yFor(p.y),
        }));
      } else {
        const byX = new Map(current.rows.map((r) => [String(r.x), r]));
        for (const p of result.points) {
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
      setFormulaError(null);
      const msg = `Updated ${result.points.length} points from formula`;
      setFormulaHint(msg);
      if (opts?.source === "apply") {
        setStatus(msg);
      }
      return true;
    },
    [recordHistory, schedulePersist],
  );

  const handleFormulaChange = useCallback((next: ChartFormulaState) => {
    setFormula(next);
    formulaRef.current = next;
    setFormulaError(null);
  }, []);

  /** Seed axis / series labels when a formula preset is picked. */
  const handlePresetAxisDefaults = useCallback(
    (axis: FormulaPresetAxisDefaults) => {
      const current = cloneChart(docRef.current);
      let changed = false;
      if (axis.xLabel !== undefined && current.xLabel !== axis.xLabel) {
        current.xLabel = axis.xLabel;
        changed = true;
      }
      if (axis.yLabel !== undefined && current.yLabel !== axis.yLabel) {
        current.yLabel = axis.yLabel;
        changed = true;
      }
      if (axis.seriesName !== undefined) {
        const seriesId = formulaRef.current.seriesId;
        const idx = current.series.findIndex((s) => s.id === seriesId);
        const target =
          idx >= 0 ? idx : current.series.length > 0 ? 0 : -1;
        if (
          target >= 0 &&
          current.series[target]!.name !== axis.seriesName
        ) {
          current.series = current.series.map((s, i) =>
            i === target ? { ...s, name: axis.seriesName! } : s,
          );
          changed = true;
        }
      }
      if (!changed) return;
      recordHistory();
      schedulePersist(current);
    },
    [recordHistory, schedulePersist],
  );

  // Debounced live eval while the formula panel is open.
  useEffect(() => {
    if (!formulaOpen) {
      if (formulaTimer.current) window.clearTimeout(formulaTimer.current);
      return;
    }
    if (formulaTimer.current) window.clearTimeout(formulaTimer.current);
    formulaTimer.current = window.setTimeout(() => {
      applyFormulaToDoc(formulaRef.current, {
        coalesce: true,
        source: "live",
      });
    }, 400);
    return () => {
      if (formulaTimer.current) window.clearTimeout(formulaTimer.current);
    };
  }, [formula, formulaOpen, applyFormulaToDoc]);

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
        setFormula(defaultChartFormulaState(loaded.series[0]?.id ?? "series-1"));
        setFormulaError(null);
        setFormulaHint(null);
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
      if (formulaTimer.current) window.clearTimeout(formulaTimer.current);
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
                  setFormulaError(null);
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
            {doc.series.length > 1 && (
              <label className="charts-inline-field">
                <span className="muted tiny">Y axis</span>
                <input
                  value={doc.yLabel}
                  placeholder="Value"
                  aria-label="Shared Y axis label"
                  onChange={(e) =>
                    applyField("yLabel", e.target.value, { coalesce: true })
                  }
                />
              </label>
            )}
          </div>

          {formulaOpen && (
            <ChartFormulaPanel
              state={formula}
              series={doc.series}
              error={formulaError}
              hint={formulaHint}
              onChange={handleFormulaChange}
              onAxisDefaults={handlePresetAxisDefaults}
              onApply={() => {
                applyFormulaToDoc(formulaRef.current, { source: "apply" });
              }}
              onClose={() => {
                setFormulaOpen(false);
                setFormulaError(null);
              }}
            />
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
