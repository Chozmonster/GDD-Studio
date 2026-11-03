import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listFlowcharts } from "../../../api";
import type { FlowchartSummary } from "../../../types";
import {
  emptyAtomicRow,
  parsePayload,
  serializePayload,
} from "./rgdContent";
import { SKILL_PRESETS, type SkillCategory } from "./rgdPresets";
import type {
  AtomicParamsPayload,
  DifficultyBand,
  GameplayPayload,
  MechanicPayload,
  PatternPayload,
  PillarsPayload,
  RgdBlockType,
  SignsFeedbackPayload,
  SkillsPayload,
} from "./rgdTypes";
import { RGD_TYPE_META } from "./rgdTypes";

type ExtraProps = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
};

function toggleSkill(
  list: string[],
  skill: string,
  on: boolean,
): string[] {
  if (on) return list.includes(skill) ? list : [...list, skill];
  return list.filter((s) => s !== skill);
}

export function RgdBlockView(props: NodeViewProps) {
  const rgdType = (props.node.attrs.rgdType as RgdBlockType) ?? "pillars";
  const meta = RGD_TYPE_META[rgdType];
  const extra = props.extension.options as ExtraProps;
  const title = String(props.node.attrs.title ?? meta.label);

  const payload = useMemo(
    () => parsePayload(rgdType, props.node.attrs.payload),
    [rgdType, props.node.attrs.payload],
  );

  const setTitle = (next: string) => {
    props.updateAttributes({ title: next });
  };

  const patchPayload = useCallback(
    (next: object) => {
      props.updateAttributes({ payload: serializePayload(next) });
    },
    [props],
  );

  return (
    <NodeViewWrapper
      className={`rgd-block rgd-${rgdType}`}
      data-rgd-type={rgdType}
      data-drag-handle
    >
      <header className="rgd-block-chrome">
        <span className="rgd-step-badge" title={meta.description}>
          RGD {meta.step} · {meta.shortLabel}
        </span>
        <input
          className="rgd-title-input"
          value={title}
          aria-label={`${meta.label} title`}
          onChange={(e) => setTitle(e.target.value)}
        />
      </header>

      {rgdType === "pillars" && (
        <PillarsFields
          payload={payload as PillarsPayload}
          onChange={patchPayload}
        />
      )}
      {rgdType === "gameplay" && (
        <GameplayFields
          payload={payload as GameplayPayload}
          onChange={patchPayload}
        />
      )}
      {rgdType === "mechanic" && (
        <MechanicFields
          payload={payload as MechanicPayload}
          onChange={patchPayload}
        />
      )}
      {rgdType === "skills" && (
        <SkillsFields
          payload={payload as SkillsPayload}
          onChange={patchPayload}
        />
      )}
      {rgdType === "atomicParams" && (
        <AtomicParamsFields
          payload={payload as AtomicParamsPayload}
          onChange={patchPayload}
        />
      )}
      {rgdType === "pattern" && (
        <PatternFields
          payload={payload as PatternPayload}
          onChange={patchPayload}
          projectId={extra.projectId}
          onOpenFlowchart={extra.onOpenFlowchart}
        />
      )}
      {rgdType === "signsFeedback" && (
        <SignsFeedbackFields
          payload={payload as SignsFeedbackPayload}
          onChange={patchPayload}
        />
      )}
    </NodeViewWrapper>
  );
}

function NotesField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="rgd-field">
      <span>Notes</span>
      <textarea
        value={value}
        placeholder={placeholder ?? "Optional notes…"}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function PillarsFields({
  payload,
  onChange,
}: {
  payload: PillarsPayload;
  onChange: (p: PillarsPayload) => void;
}) {
  const pillars = payload.pillars.length ? payload.pillars : [""];
  return (
    <div className="rgd-fields">
      <p className="rgd-hint muted tiny">
        Gameplay-only experience pillars (e.g. Fast-Paced, Party Game).
      </p>
      <ul className="rgd-pillar-list">
        {pillars.map((p, i) => (
          <li key={i}>
            <input
              value={p}
              placeholder={`Pillar ${i + 1}`}
              aria-label={`Pillar ${i + 1}`}
              onChange={(e) => {
                const next = pillars.slice();
                next[i] = e.target.value;
                onChange({ ...payload, pillars: next });
              }}
            />
            {pillars.length > 1 && (
              <button
                type="button"
                className="ghost tiny-btn"
                aria-label={`Remove pillar ${i + 1}`}
                onClick={() =>
                  onChange({
                    ...payload,
                    pillars: pillars.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="ghost tiny-btn"
        onClick={() => onChange({ ...payload, pillars: [...pillars, ""] })}
      >
        Add pillar
      </button>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}

function GameplayFields({
  payload,
  onChange,
}: {
  payload: GameplayPayload;
  onChange: (p: GameplayPayload) => void;
}) {
  return (
    <div className="rgd-fields">
      <label className="rgd-field">
        <span>Gameplay</span>
        <input
          value={payload.gameplay}
          placeholder="e.g. Melee Combat, Platforming"
          onChange={(e) => onChange({ ...payload, gameplay: e.target.value })}
        />
      </label>
      <label className="rgd-field">
        <span>Goal</span>
        <textarea
          value={payload.goal}
          rows={2}
          placeholder="Objective of this gameplay…"
          onChange={(e) => onChange({ ...payload, goal: e.target.value })}
        />
      </label>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}

function MechanicFields({
  payload,
  onChange,
}: {
  payload: MechanicPayload;
  onChange: (p: MechanicPayload) => void;
}) {
  return (
    <div className="rgd-fields">
      <label className="rgd-field">
        <span>Mechanic</span>
        <input
          value={payload.name}
          placeholder="e.g. Jumping, Aim & Shoot"
          onChange={(e) => onChange({ ...payload, name: e.target.value })}
        />
      </label>
      <label className="rgd-check">
        <input
          type="checkbox"
          checked={payload.involvesChallenge}
          onChange={(e) =>
            onChange({ ...payload, involvesChallenge: e.target.checked })
          }
        />
        <span>
          Involves challenge (skills &amp; atomic params). Uncheck for
          non-challenge interactions (doors, pots…).
        </span>
      </label>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}

function SkillsFields({
  payload,
  onChange,
}: {
  payload: SkillsPayload;
  onChange: (p: SkillsPayload) => void;
}) {
  const renderCategory = (cat: SkillCategory, selected: string[]) => (
    <fieldset className="rgd-skill-set" key={cat}>
      <legend>{cat[0]!.toUpperCase() + cat.slice(1)}</legend>
      <div className="rgd-skill-tags">
        {SKILL_PRESETS[cat].map((skill) => {
          const on = selected.includes(skill);
          return (
            <label key={skill} className={on ? "rgd-tag on" : "rgd-tag"}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) =>
                  onChange({
                    ...payload,
                    [cat]: toggleSkill(selected, skill, e.target.checked),
                  })
                }
              />
              {skill}
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <div className="rgd-fields">
      <p className="rgd-hint muted tiny">
        Presets from RGD — add custom skills in notes if needed.
      </p>
      {renderCategory("physical", payload.physical)}
      {renderCategory("mental", payload.mental)}
      {renderCategory("social", payload.social)}
      <label className="rgd-field">
        <span>Inputs</span>
        <textarea
          value={payload.inputs}
          rows={2}
          placeholder="Input challenge notes (combos, timing windows…)"
          onChange={(e) => onChange({ ...payload, inputs: e.target.value })}
        />
      </label>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}

const BANDS: DifficultyBand[] = ["easy", "medium", "hard", "none"];

function AtomicParamsFields({
  payload,
  onChange,
}: {
  payload: AtomicParamsPayload;
  onChange: (p: AtomicParamsPayload) => void;
}) {
  const rows = payload.rows.length ? payload.rows : [emptyAtomicRow()];

  const updateRow = (id: string, patch: Partial<(typeof rows)[0]>) => {
    onChange({
      ...payload,
      rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  return (
    <div className="rgd-fields">
      <p className="rgd-hint muted tiny">
        Define Easy / Medium / Hard values, or mark None (no challenge).
      </p>
      <div className="rgd-params-table-wrap">
        <table className="rgd-params-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Easy</th>
              <th>Medium</th>
              <th>Hard</th>
              <th>Band</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.none ? "is-none" : undefined}>
                <td>
                  <input
                    value={row.name}
                    placeholder="Name"
                    aria-label="Parameter name"
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={row.easy}
                    disabled={row.none}
                    placeholder="E"
                    aria-label="Easy value"
                    onChange={(e) => updateRow(row.id, { easy: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    value={row.medium}
                    disabled={row.none}
                    placeholder="M"
                    aria-label="Medium value"
                    onChange={(e) =>
                      updateRow(row.id, { medium: e.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    value={row.hard}
                    disabled={row.none}
                    placeholder="H"
                    aria-label="Hard value"
                    onChange={(e) => updateRow(row.id, { hard: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={row.none ? "none" : row.activeBand}
                    aria-label="Active difficulty band"
                    onChange={(e) => {
                      const v = e.target.value as DifficultyBand;
                      if (v === "none") {
                        updateRow(row.id, { none: true, activeBand: "none" });
                      } else {
                        updateRow(row.id, { none: false, activeBand: v });
                      }
                    }}
                  >
                    {BANDS.map((b) => (
                      <option key={b} value={b}>
                        {b === "none" ? "None" : b[0]!.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost tiny-btn"
                    aria-label="Remove parameter"
                    disabled={rows.length <= 1}
                    onClick={() =>
                      onChange({
                        ...payload,
                        rows: rows.filter((r) => r.id !== row.id),
                      })
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="ghost tiny-btn"
        onClick={() =>
          onChange({ ...payload, rows: [...rows, emptyAtomicRow()] })
        }
      >
        Add parameter
      </button>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}

function PatternFields({
  payload,
  onChange,
  projectId,
  onOpenFlowchart,
}: {
  payload: PatternPayload;
  onChange: (p: PatternPayload) => void;
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
}) {
  const [flowcharts, setFlowcharts] = useState<FlowchartSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listFlowcharts(projectId).then((list) => {
      if (!cancelled) setFlowcharts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="rgd-fields">
      <label className="rgd-field">
        <span>Pattern name</span>
        <input
          value={payload.name}
          placeholder="e.g. Enemy Formation"
          onChange={(e) => onChange({ ...payload, name: e.target.value })}
        />
      </label>
      <label className="rgd-field">
        <span>Ingredients used</span>
        <textarea
          value={payload.ingredients}
          rows={2}
          placeholder="Common enemies, obstacles…"
          onChange={(e) =>
            onChange({ ...payload, ingredients: e.target.value })
          }
        />
      </label>
      <label className="rgd-field">
        <span>Linked flowchart</span>
        <div className="rgd-flowchart-row">
          <select
            value={payload.flowchartId}
            aria-label="Linked flowchart"
            onChange={(e) =>
              onChange({ ...payload, flowchartId: e.target.value })
            }
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
            disabled={!payload.flowchartId}
            onClick={() =>
              payload.flowchartId && onOpenFlowchart?.(payload.flowchartId)
            }
          >
            Open
          </button>
        </div>
      </label>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}

function SignsFeedbackFields({
  payload,
  onChange,
}: {
  payload: SignsFeedbackPayload;
  onChange: (p: SignsFeedbackPayload) => void;
}) {
  return (
    <div className="rgd-fields">
      <label className="rgd-field">
        <span>Signs (readability)</span>
        <textarea
          value={payload.signs}
          rows={2}
          placeholder="How the player reads the challenge ahead of time…"
          onChange={(e) => onChange({ ...payload, signs: e.target.value })}
        />
      </label>
      <label className="rgd-field">
        <span>Feedback</span>
        <textarea
          value={payload.feedback}
          rows={2}
          placeholder="How the game confirms success, failure, progress…"
          onChange={(e) => onChange({ ...payload, feedback: e.target.value })}
        />
      </label>
      <NotesField
        value={payload.notes}
        onChange={(notes) => onChange({ ...payload, notes })}
      />
    </div>
  );
}
