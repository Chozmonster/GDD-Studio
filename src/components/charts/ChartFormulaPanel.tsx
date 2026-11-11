import { useMemo, useState } from "react";
import {
  CHART_FORMULA_PRESETS,
  CHART_INDEPENDENT_VAR,
  CUSTOM_FORMULA_NOTE,
  detectFormulaIdentifiers,
  explanationForPresetId,
  isValidFormulaVarName,
  type FormulaPreset,
  type FormulaPresetAxisDefaults,
} from "../../lib/chartFormula";
import type { ChartSeries } from "../../types";

export type FormulaVarBinding = {
  name: string;
  value: string;
};

export type ChartFormulaState = {
  expression: string;
  variables: FormulaVarBinding[];
  xStart: string;
  xEnd: string;
  step: string;
  seriesId: string;
  replaceRows: boolean;
  /** Selected preset id, or "" for custom. */
  presetId: string;
};

export function defaultChartFormulaState(seriesId: string): ChartFormulaState {
  const power = CHART_FORMULA_PRESETS.find((p) => p.id === "power")!;
  return {
    expression: power.expression,
    variables: power.variables.map((v) => ({ ...v })),
    xStart: power.domain?.xStart ?? "1",
    xEnd: power.domain?.xEnd ?? "20",
    step: power.domain?.step ?? "1",
    seriesId,
    replaceRows: true,
    presetId: power.id,
  };
}

export function applyPresetToState(
  state: ChartFormulaState,
  preset: FormulaPreset,
): ChartFormulaState {
  return {
    ...state,
    expression: preset.expression,
    variables: preset.variables.map((v) => ({ ...v })),
    presetId: preset.id,
    ...(preset.domain
      ? {
          xStart: preset.domain.xStart,
          xEnd: preset.domain.xEnd,
          step: preset.domain.step,
        }
      : {}),
  };
}

type ChartFormulaPanelProps = {
  state: ChartFormulaState;
  series: ChartSeries[];
  chartType: "line" | "bar";
  /** Inline eval error (null when ok / idle). */
  error: string | null;
  /** Soft status (e.g. “Updated 20 points”). */
  hint?: string | null;
  onChange: (next: ChartFormulaState) => void;
  onChartTypeChange: (next: "line" | "bar") => void;
  /** Called when a preset seeds suggested axis / series labels. */
  onAxisDefaults?: (axis: FormulaPresetAxisDefaults) => void;
  onApply: () => void;
};

export function ChartFormulaPanel({
  state,
  series,
  chartType,
  error,
  hint,
  onChange,
  onChartTypeChange,
  onAxisDefaults,
  onApply,
}: ChartFormulaPanelProps) {
  const [draftVarName, setDraftVarName] = useState("");
  const [draftVarError, setDraftVarError] = useState<string | null>(null);

  const detected = useMemo(
    () => detectFormulaIdentifiers(state.expression, CHART_INDEPENDENT_VAR),
    [state.expression],
  );

  const boundNames = useMemo(
    () => new Set(state.variables.map((v) => v.name.toLowerCase())),
    [state.variables],
  );

  const missingDetected =
    detected.ok
      ? detected.names.filter((n) => !boundNames.has(n.toLowerCase()))
      : [];

  const explanation = explanationForPresetId(state.presetId);

  const setExpression = (expression: string) => {
    onChange({ ...state, expression, presetId: "" });
  };

  const setVarValue = (name: string, value: string) => {
    onChange({
      ...state,
      variables: state.variables.map((v) =>
        v.name === name ? { ...v, value } : v,
      ),
      presetId: state.presetId, // keep preset id; values may diverge
    });
  };

  const addVariable = (name: string, value = "1") => {
    const err = isValidFormulaVarName(name);
    if (err) {
      setDraftVarError(err);
      return;
    }
    if (boundNames.has(name.trim().toLowerCase())) {
      setDraftVarError(`“${name.trim()}” is already listed`);
      return;
    }
    setDraftVarError(null);
    setDraftVarName("");
    onChange({
      ...state,
      variables: [...state.variables, { name: name.trim(), value }],
    });
  };

  const removeVariable = (name: string) => {
    onChange({
      ...state,
      variables: state.variables.filter((v) => v.name !== name),
      presetId: "",
    });
  };

  const onPreset = (presetId: string) => {
    if (!presetId) {
      onChange({ ...state, presetId: "" });
      return;
    }
    const preset = CHART_FORMULA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange(applyPresetToState(state, preset));
    if (preset.axis) onAxisDefaults?.(preset.axis);
  };

  return (
    <div
      className="charts-formula-panel"
      role="region"
      aria-label="Formula helper"
    >
      <p className="muted tiny charts-formula-lede">
        Expression in <code>{CHART_INDEPENDENT_VAR}</code> + constants; domain
        fills table and graph.{" "}
        <code>+ - * / ^ ( )</code> ·{" "}
        <code>exp abs sqrt ln log sin cos tan min max pow</code>
      </p>

      {/* Formula left; Preset + Type clustered on the right (prefs). */}
      <div className="charts-formula-top">
        <label className="charts-inline-field charts-formula-expr-field">
          <span className="muted tiny">Formula</span>
          <input
            className="charts-formula-expr"
            value={state.expression}
            spellCheck={false}
            placeholder="e.g. a * x^b + c"
            aria-label="Formula expression"
            onChange={(e) => setExpression(e.target.value)}
          />
        </label>
        <div className="charts-formula-top-right">
          <label className="charts-inline-field charts-formula-preset-field">
            <span className="muted tiny">Preset</span>
            <select
              value={state.presetId}
              onChange={(e) => onPreset(e.target.value)}
              aria-label="Formula preset"
            >
              <option value="">Custom</option>
              {CHART_FORMULA_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="charts-inline-field charts-formula-type-field">
            <span className="muted tiny">Type</span>
            <select
              value={chartType}
              onChange={(e) =>
                onChartTypeChange(e.target.value === "bar" ? "bar" : "line")
              }
              aria-label="Chart type"
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
            </select>
          </label>
        </div>
      </div>

      <p
        className="muted tiny charts-formula-explanation"
        role="note"
        aria-live="polite"
      >
        {explanation || CUSTOM_FORMULA_NOTE}
      </p>

      <div className="charts-formula-vars">
        <div className="charts-formula-vars-header">
          <span className="muted tiny">Variables</span>
          <span className="muted tiny">
            <code>{CHART_INDEPENDENT_VAR}</code> is swept (not listed)
          </span>
        </div>
        {state.variables.length === 0 ? (
          <p className="muted tiny charts-formula-vars-empty">
            No constants yet — add one or pick a preset.
          </p>
        ) : (
          <ul className="charts-formula-var-list">
            {state.variables.map((v) => (
              <li key={v.name} className="charts-formula-var-chip">
                <span className="charts-formula-var-name">{v.name}</span>
                <input
                  className="chart-cell-input charts-formula-var-value"
                  inputMode="decimal"
                  value={v.value}
                  aria-label={`Value for ${v.name}`}
                  onChange={(e) => setVarValue(v.name, e.target.value)}
                />
                <button
                  type="button"
                  className="ghost tiny-btn charts-formula-var-remove"
                  title={`Remove ${v.name}`}
                  aria-label={`Remove ${v.name}`}
                  onClick={() => removeVariable(v.name)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {missingDetected.length > 0 && (
          <div className="charts-formula-detected">
            <span className="muted tiny">In formula, not listed:</span>
            {missingDetected.map((name) => (
              <button
                key={name}
                type="button"
                className="ghost tiny-btn"
                onClick={() => addVariable(name, "1")}
              >
                Add {name}
              </button>
            ))}
          </div>
        )}

        <div className="charts-formula-add-var">
          <input
            className="chart-cell-input"
            value={draftVarName}
            placeholder="name"
            aria-label="New variable name"
            onChange={(e) => {
              setDraftVarName(e.target.value);
              setDraftVarError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addVariable(draftVarName);
              }
            }}
          />
          <button
            type="button"
            className="ghost tiny-btn"
            onClick={() => addVariable(draftVarName)}
          >
            Add variable
          </button>
          {draftVarError && (
            <span className="charts-formula-error tiny" role="alert">
              {draftVarError}
            </span>
          )}
        </div>
      </div>

      <div className="charts-formula-footer">
        <div className="charts-formula-grid">
          <label>
            x start
            <input
              value={state.xStart}
              inputMode="decimal"
              onChange={(e) =>
                onChange({ ...state, xStart: e.target.value })
              }
            />
          </label>
          <label>
            x end
            <input
              value={state.xEnd}
              inputMode="decimal"
              onChange={(e) => onChange({ ...state, xEnd: e.target.value })}
            />
          </label>
          <label>
            step
            <input
              value={state.step}
              inputMode="decimal"
              onChange={(e) => onChange({ ...state, step: e.target.value })}
            />
          </label>
          <label>
            Series
            <select
              value={state.seriesId}
              onChange={(e) =>
                onChange({ ...state, seriesId: e.target.value })
              }
            >
              {series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="charts-formula-actions">
          <label className="charts-formula-replace">
            <input
              type="checkbox"
              checked={state.replaceRows}
              onChange={(e) =>
                onChange({ ...state, replaceRows: e.target.checked })
              }
            />
            Replace all rows
          </label>
          <button type="button" className="primary tiny-btn" onClick={onApply}>
            Apply to table
          </button>
        </div>
      </div>

      {error && (
        <p className="charts-formula-error" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="muted tiny charts-formula-hint" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
