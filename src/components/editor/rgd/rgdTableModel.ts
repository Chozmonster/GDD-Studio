import {
  parseSkillCategory,
  type SkillCategory,
} from "./rgdPresets";

/** Mechanic → skill → parameter/case hierarchy for RGD live tables. */

export type RgdParameterRow = {
  id: string;
  /** Atomic parameter name. */
  name: string;
  /** Example of the parameter being tested (optional). */
  caseText: string;
};

export type RgdSkillNode = {
  id: string;
  name: string;
  /** Physical | Mental | Social — required for form + table color coding. */
  category: SkillCategory;
  parameters: RgdParameterRow[];
};

export type RgdMechanicNode = {
  id: string;
  /** Mechanic, system, or interaction. */
  name: string;
  /** Optional player input — shown in the table only when set. */
  playerInput: string;
  skills: RgdSkillNode[];
};

export type RgdSheetMeta = {
  pillars: string[];
  pillarsNotes: string;
  goal: string;
  gameplayNotes: string;
  patternName: string;
  patternIngredients: string;
  patternFlowchartId: string;
  patternNotes: string;
  signs: string;
  feedback: string;
  signsNotes: string;
};

/** One leaf row in the rowspan table. */
export type RgdTableLeaf = {
  key: string;
  mechanic: RgdMechanicNode | null;
  mechanicRowspan: number;
  showMechanic: boolean;
  skill: RgdSkillNode | null;
  skillRowspan: number;
  showSkill: boolean;
  parameter: RgdParameterRow;
};

function newId(): string {
  return crypto.randomUUID();
}

export function emptyParameter(name = "", caseText = ""): RgdParameterRow {
  return { id: newId(), name, caseText };
}

export function emptySkill(
  name = "",
  category: SkillCategory = "physical",
): RgdSkillNode {
  return {
    id: newId(),
    name,
    category,
    parameters: [emptyParameter()],
  };
}

export function emptyMechanic(name = ""): RgdMechanicNode {
  return {
    id: newId(),
    name,
    playerInput: "",
    skills: [emptySkill()],
  };
}

export function emptySheetMeta(): RgdSheetMeta {
  return {
    pillars: [],
    pillarsNotes: "",
    goal: "",
    gameplayNotes: "",
    patternName: "",
    patternIngredients: "",
    patternFlowchartId: "",
    patternNotes: "",
    signs: "",
    feedback: "",
    signsNotes: "",
  };
}

function skillLeafCount(skill: RgdSkillNode): number {
  return Math.max(1, skill.parameters.length);
}

function mechanicLeafCount(mechanic: RgdMechanicNode): number {
  if (!mechanic.skills.length) return 1;
  return mechanic.skills.reduce((n, s) => n + skillLeafCount(s), 0);
}

/** Flatten mechanics into rowspan-aware leaf rows for the live table. */
export function flattenRgdTable(mechanics: RgdMechanicNode[]): RgdTableLeaf[] {
  const rows: RgdTableLeaf[] = [];
  for (const mechanic of mechanics) {
    const mSpan = mechanicLeafCount(mechanic);
    let mShown = false;
    const skills = mechanic.skills.length ? mechanic.skills : [emptySkill()];
    for (const skill of skills) {
      const sSpan = skillLeafCount(skill);
      let sShown = false;
      const params =
        skill.parameters.length > 0 ? skill.parameters : [emptyParameter()];
      for (const parameter of params) {
        rows.push({
          key: `${mechanic.id}:${skill.id}:${parameter.id}`,
          mechanic,
          mechanicRowspan: mSpan,
          showMechanic: !mShown,
          skill,
          skillRowspan: sSpan,
          showSkill: !sShown,
          parameter,
        });
        mShown = true;
        sShown = true;
      }
    }
  }
  return rows;
}

export function parseMechanics(raw: unknown): RgdMechanicNode[] {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyMechanic()];
  return raw.map((item) => {
    const m = (item ?? {}) as Partial<RgdMechanicNode>;
    const skillsRaw = Array.isArray(m.skills) ? m.skills : [];
    const skills =
      skillsRaw.length > 0
        ? skillsRaw.map((s) => {
            const skill = (s ?? {}) as Partial<RgdSkillNode>;
            const paramsRaw = Array.isArray(skill.parameters)
              ? skill.parameters
              : [];
            const parameters =
              paramsRaw.length > 0
                ? paramsRaw.map((p) => {
                    const param = (p ?? {}) as Partial<RgdParameterRow>;
                    return {
                      id:
                        typeof param.id === "string" && param.id
                          ? param.id
                          : newId(),
                      name: typeof param.name === "string" ? param.name : "",
                      caseText:
                        typeof param.caseText === "string"
                          ? param.caseText
                          : "",
                    };
                  })
                : [emptyParameter()];
            const name = typeof skill.name === "string" ? skill.name : "";
            return {
              id:
                typeof skill.id === "string" && skill.id ? skill.id : newId(),
              name,
              category: parseSkillCategory(skill.category, name),
              parameters,
            };
          })
        : [emptySkill()];
    return {
      id: typeof m.id === "string" && m.id ? m.id : newId(),
      name: typeof m.name === "string" ? m.name : "",
      playerInput:
        typeof m.playerInput === "string" ? m.playerInput : "",
      skills,
    };
  });
}

export function parseSheetMeta(raw: unknown): RgdSheetMeta {
  const base = emptySheetMeta();
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Partial<RgdSheetMeta>;
  return {
    pillars: Array.isArray(m.pillars)
      ? m.pillars.filter((p): p is string => typeof p === "string")
      : [],
    pillarsNotes:
      typeof m.pillarsNotes === "string" ? m.pillarsNotes : "",
    goal: typeof m.goal === "string" ? m.goal : "",
    gameplayNotes:
      typeof m.gameplayNotes === "string" ? m.gameplayNotes : "",
    patternName: typeof m.patternName === "string" ? m.patternName : "",
    patternIngredients:
      typeof m.patternIngredients === "string" ? m.patternIngredients : "",
    patternFlowchartId:
      typeof m.patternFlowchartId === "string" ? m.patternFlowchartId : "",
    patternNotes:
      typeof m.patternNotes === "string" ? m.patternNotes : "",
    signs: typeof m.signs === "string" ? m.signs : "",
    feedback: typeof m.feedback === "string" ? m.feedback : "",
    signsNotes: typeof m.signsNotes === "string" ? m.signsNotes : "",
  };
}
