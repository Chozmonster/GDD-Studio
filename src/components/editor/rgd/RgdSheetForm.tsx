import { SKILL_PRESETS } from "./rgdPresets";
import {
  emptyMechanic,
  emptyParameter,
  emptySkill,
  type RgdMechanicNode,
  type RgdSheetMeta,
} from "./rgdTableModel";

type RgdSheetFormProps = {
  mechanics: RgdMechanicNode[];
  meta: RgdSheetMeta;
  onMechanicsChange: (mechanics: RgdMechanicNode[]) => void;
  onMetaChange: (meta: RgdSheetMeta) => void;
  flowcharts: Array<{ id: string; name: string }>;
  onOpenFlowchart?: (flowchartId: string) => void;
};

const ALL_SKILL_PRESETS = [
  ...SKILL_PRESETS.physical,
  ...SKILL_PRESETS.mental,
  ...SKILL_PRESETS.social,
];

export function RgdSheetForm({
  mechanics,
  meta,
  onMechanicsChange,
  onMetaChange,
  flowcharts,
  onOpenFlowchart,
}: RgdSheetFormProps) {
  const updateMechanic = (index: number, next: RgdMechanicNode) => {
    const list = mechanics.slice();
    list[index] = next;
    onMechanicsChange(list);
  };

  const removeMechanic = (index: number) => {
    if (mechanics.length <= 1) {
      onMechanicsChange([emptyMechanic()]);
      return;
    }
    onMechanicsChange(mechanics.filter((_, i) => i !== index));
  };

  return (
    <div className="rgd-sheet-form">
      <section className="rgd-form-section" aria-label="Mechanics table">
        <header className="rgd-form-section-header">
          <h3>Mechanics</h3>
          <p className="muted tiny">
            One mechanic → many skills → many atomic parameters (each with an
            optional case). Player input is optional — leave blank when the
            mechanic has no input.
          </p>
        </header>

        <ul className="rgd-mechanic-list">
          {mechanics.map((mechanic, mi) => (
            <li key={mechanic.id} className="rgd-mechanic-card">
              <div className="rgd-mechanic-head">
                <label className="rgd-field grow">
                  <span>Mechanic / system / interaction</span>
                  <input
                    value={mechanic.name}
                    placeholder="e.g. Jumping"
                    aria-label={`Mechanic ${mi + 1} name`}
                    onChange={(e) =>
                      updateMechanic(mi, {
                        ...mechanic,
                        name: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="rgd-field grow">
                  <span>Player input (optional)</span>
                  <input
                    value={mechanic.playerInput}
                    placeholder="e.g. A button — omit if none"
                    aria-label={`Mechanic ${mi + 1} player input`}
                    onChange={(e) =>
                      updateMechanic(mi, {
                        ...mechanic,
                        playerInput: e.target.value,
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="ghost tiny-btn"
                  aria-label={`Remove mechanic ${mi + 1}`}
                  onClick={() => removeMechanic(mi)}
                >
                  Remove
                </button>
              </div>

              <ul className="rgd-skill-list">
                {mechanic.skills.map((skill, si) => (
                  <li key={skill.id} className="rgd-skill-block">
                    <div className="rgd-skill-head">
                      <label className="rgd-field grow">
                        <span>Player skill</span>
                        <input
                          list="rgd-skill-presets"
                          value={skill.name}
                          placeholder="e.g. Timing"
                          aria-label={`Mechanic ${mi + 1} skill ${si + 1}`}
                          onChange={(e) => {
                            const skills = mechanic.skills.slice();
                            skills[si] = { ...skill, name: e.target.value };
                            updateMechanic(mi, { ...mechanic, skills });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost tiny-btn"
                        aria-label={`Remove skill ${si + 1}`}
                        onClick={() => {
                          const skills =
                            mechanic.skills.length <= 1
                              ? [emptySkill()]
                              : mechanic.skills.filter((_, i) => i !== si);
                          updateMechanic(mi, { ...mechanic, skills });
                        }}
                      >
                        Remove skill
                      </button>
                    </div>

                    <table className="rgd-param-form-table">
                      <thead>
                        <tr>
                          <th scope="col">Atomic parameter</th>
                          <th scope="col">Case (example)</th>
                          <th scope="col">
                            <span className="visually-hidden">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {skill.parameters.map((param, pi) => (
                          <tr key={param.id}>
                            <td>
                              <input
                                value={param.name}
                                placeholder="e.g. Window of Opportunity"
                                aria-label={`Parameter ${pi + 1} name`}
                                onChange={(e) => {
                                  const parameters = skill.parameters.slice();
                                  parameters[pi] = {
                                    ...param,
                                    name: e.target.value,
                                  };
                                  const skills = mechanic.skills.slice();
                                  skills[si] = { ...skill, parameters };
                                  updateMechanic(mi, { ...mechanic, skills });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                value={param.caseText}
                                placeholder="Example of this param being tested"
                                aria-label={`Parameter ${pi + 1} case`}
                                onChange={(e) => {
                                  const parameters = skill.parameters.slice();
                                  parameters[pi] = {
                                    ...param,
                                    caseText: e.target.value,
                                  };
                                  const skills = mechanic.skills.slice();
                                  skills[si] = { ...skill, parameters };
                                  updateMechanic(mi, { ...mechanic, skills });
                                }}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ghost tiny-btn"
                                aria-label={`Remove parameter ${pi + 1}`}
                                onClick={() => {
                                  const parameters =
                                    skill.parameters.length <= 1
                                      ? [emptyParameter()]
                                      : skill.parameters.filter(
                                          (_, i) => i !== pi,
                                        );
                                  const skills = mechanic.skills.slice();
                                  skills[si] = { ...skill, parameters };
                                  updateMechanic(mi, { ...mechanic, skills });
                                }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      className="ghost tiny-btn"
                      onClick={() => {
                        const parameters = [
                          ...skill.parameters,
                          emptyParameter(),
                        ];
                        const skills = mechanic.skills.slice();
                        skills[si] = { ...skill, parameters };
                        updateMechanic(mi, { ...mechanic, skills });
                      }}
                    >
                      Add parameter
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="ghost tiny-btn"
                onClick={() =>
                  updateMechanic(mi, {
                    ...mechanic,
                    skills: [...mechanic.skills, emptySkill()],
                  })
                }
              >
                Add skill
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="ghost"
          onClick={() => onMechanicsChange([...mechanics, emptyMechanic()])}
        >
          Add mechanic
        </button>

        <datalist id="rgd-skill-presets">
          {ALL_SKILL_PRESETS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </section>

      <details className="rgd-meta-details">
        <summary>Optional context (pillars, pattern, signs)</summary>
        <div className="rgd-meta-grid">
          <label className="rgd-field">
            <span>Experience pillars</span>
            <input
              value={meta.pillars.join(", ")}
              placeholder="Comma-separated pillars"
              onChange={(e) =>
                onMetaChange({
                  ...meta,
                  pillars: e.target.value
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="rgd-field">
            <span>Goal</span>
            <input
              value={meta.goal}
              placeholder="Player objective"
              onChange={(e) =>
                onMetaChange({ ...meta, goal: e.target.value })
              }
            />
          </label>
          <label className="rgd-field">
            <span>Pattern name</span>
            <input
              value={meta.patternName}
              onChange={(e) =>
                onMetaChange({ ...meta, patternName: e.target.value })
              }
            />
          </label>
          <label className="rgd-field">
            <span>Pattern ingredients</span>
            <input
              value={meta.patternIngredients}
              onChange={(e) =>
                onMetaChange({
                  ...meta,
                  patternIngredients: e.target.value,
                })
              }
            />
          </label>
          <label className="rgd-field">
            <span>Pattern flowchart</span>
            <div className="rgd-flowchart-row">
              <select
                value={meta.patternFlowchartId}
                aria-label="Pattern flowchart"
                onChange={(e) =>
                  onMetaChange({
                    ...meta,
                    patternFlowchartId: e.target.value,
                  })
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
                disabled={!meta.patternFlowchartId}
                onClick={() =>
                  meta.patternFlowchartId &&
                  onOpenFlowchart?.(meta.patternFlowchartId)
                }
              >
                Open
              </button>
            </div>
          </label>
          <label className="rgd-field">
            <span>Signs</span>
            <textarea
              rows={2}
              value={meta.signs}
              onChange={(e) =>
                onMetaChange({ ...meta, signs: e.target.value })
              }
            />
          </label>
          <label className="rgd-field">
            <span>Feedback</span>
            <textarea
              rows={2}
              value={meta.feedback}
              onChange={(e) =>
                onMetaChange({ ...meta, feedback: e.target.value })
              }
            />
          </label>
        </div>
      </details>
    </div>
  );
}
