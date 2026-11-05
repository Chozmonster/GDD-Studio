import type { RgdSheetDocument } from "../../../types";
import { parsePayload } from "./rgdContent";
import type { RgdBlockType } from "./rgdTypes";
import { RGD_INSERT_ORDER } from "./rgdTypes";
import {
  countFilledMechanics,
  emptyMechanic,
  emptyParameter,
  emptySheetMeta,
  parseMechanics,
  parseSheetMeta,
  type RgdMechanicNode,
  type RgdParameterRow,
  type RgdSheetMeta,
  type RgdSkillNode,
} from "./rgdTableModel";

export type {
  RgdMechanicNode,
  RgdParameterRow,
  RgdSheetMeta,
  RgdSkillNode,
} from "./rgdTableModel";

export {
  emptyMechanic,
  emptyParameter,
  emptySheetMeta,
  emptySkill,
  flattenRgdTable,
  mechanicLeafCount,
} from "./rgdTableModel";

const SHEET_VERSION = 2;

function newId(): string {
  return crypto.randomUUID();
}

export function emptyRgdSheetDocument(
  id: string,
  name?: string,
): RgdSheetDocument {
  return {
    format: "gdd-studio-rgd-sheet",
    version: SHEET_VERSION,
    id,
    name: name ?? (id === "main" ? "Main gameplay" : id),
    primaryFlowchartId: "",
    mechanics: [emptyMechanic()],
    meta: emptySheetMeta(),
  };
}

function caseFromAtomicRow(row: {
  easy: string;
  medium: string;
  hard: string;
  none: boolean;
  activeBand: string;
}): string {
  if (row.none) return "";
  const band = row.activeBand;
  if (band === "easy" && row.easy.trim()) return row.easy.trim();
  if (band === "medium" && row.medium.trim()) return row.medium.trim();
  if (band === "hard" && row.hard.trim()) return row.hard.trim();
  const parts = [row.easy, row.medium, row.hard]
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] ?? "";
}

/** Map legacy 7-step payloads into the mechanic → skill → param tree + meta. */
export function migrateStepsToTable(
  steps: RgdSheetDocument["steps"] | undefined,
  fallbackName: string,
): {
  name: string;
  mechanics: RgdMechanicNode[];
  meta: RgdSheetMeta;
} {
  const meta = emptySheetMeta();
  let name = fallbackName;

  if (!steps || Object.keys(steps).length === 0) {
    return { name, mechanics: [emptyMechanic()], meta };
  }

  const pillars = parsePayload("pillars", steps.pillars?.payload);
  meta.pillars = pillars.pillars.map((p) => p.trim()).filter(Boolean);
  meta.pillarsNotes = pillars.notes;

  const gameplay = parsePayload("gameplay", steps.gameplay?.payload);
  if (gameplay.gameplay.trim()) name = gameplay.gameplay.trim();
  meta.goal = gameplay.goal;
  meta.gameplayNotes = gameplay.notes;

  const mechanic = parsePayload("mechanic", steps.mechanic?.payload);
  const skills = parsePayload("skills", steps.skills?.payload);
  const atomic = parsePayload("atomicParams", steps.atomicParams?.payload);
  const pattern = parsePayload("pattern", steps.pattern?.payload);
  const signs = parsePayload("signsFeedback", steps.signsFeedback?.payload);

  meta.patternName = pattern.name;
  meta.patternIngredients = pattern.ingredients;
  meta.patternFlowchartId = pattern.flowchartId;
  meta.patternNotes = pattern.notes;
  meta.signs = signs.signs;
  meta.feedback = signs.feedback;
  meta.signsNotes = signs.notes;

  const categorizedSkills: Array<{
    name: string;
    category: "physical" | "mental" | "social";
  }> = [
    ...skills.physical
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, category: "physical" as const })),
    ...skills.mental
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, category: "mental" as const })),
    ...skills.social
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, category: "social" as const })),
  ];

  const paramRows: RgdParameterRow[] = atomic.rows
    .filter(
      (r) =>
        r.name.trim() ||
        r.easy.trim() ||
        r.medium.trim() ||
        r.hard.trim(),
    )
    .map((r) => ({
      id: r.id || newId(),
      name: r.name.trim(),
      caseText: caseFromAtomicRow(r),
    }));

  const skillNodes: RgdSkillNode[] =
    categorizedSkills.length > 0
      ? categorizedSkills.map((skill, i) => ({
          id: newId(),
          name: skill.name,
          category: skill.category,
          parameters:
            i === 0
              ? paramRows.length
                ? paramRows
                : [emptyParameter()]
              : [emptyParameter()],
        }))
      : [
          {
            id: newId(),
            name: "",
            category: "physical",
            parameters: paramRows.length ? paramRows : [emptyParameter()],
          },
        ];

  const hasMechanicContent =
    Boolean(mechanic.name.trim()) ||
    Boolean(skills.inputs.trim()) ||
    categorizedSkills.length > 0 ||
    paramRows.length > 0;

  const mechanics: RgdMechanicNode[] = hasMechanicContent
    ? [
        {
          id: newId(),
          name: mechanic.name.trim() || "Mechanic",
          playerInput: skills.inputs.trim(),
          skills: skillNodes,
        },
      ]
    : [emptyMechanic()];

  return { name, mechanics, meta };
}

function hasV2Mechanics(doc: RgdSheetDocument): boolean {
  return Array.isArray(doc.mechanics);
}

/**
 * Normalize any on-disk sheet to the v2 table model.
 * Migrates legacy `steps` when `mechanics` is absent.
 */
export function normalizeRgdSheet(doc: RgdSheetDocument): RgdSheetDocument {
  const id = doc.id || "main";
  const primaryFlowchartId = doc.primaryFlowchartId ?? "";

  if (hasV2Mechanics(doc)) {
    let meta = parseSheetMeta(doc.meta);
    // If meta is empty but legacy steps still exist, pull optional fields once.
    if (
      doc.steps &&
      !meta.pillars.length &&
      !meta.goal &&
      !meta.patternName &&
      !meta.signs
    ) {
      const migrated = migrateStepsToTable(doc.steps, doc.name || id);
      meta = migrated.meta;
    }
    return {
      format: "gdd-studio-rgd-sheet",
      version: SHEET_VERSION,
      id,
      name: doc.name || id,
      primaryFlowchartId,
      mechanics: parseMechanics(doc.mechanics),
      meta,
    };
  }

  const migrated = migrateStepsToTable(doc.steps, doc.name || id);
  return {
    format: "gdd-studio-rgd-sheet",
    version: SHEET_VERSION,
    id,
    name: migrated.name || doc.name || id,
    primaryFlowchartId,
    mechanics: migrated.mechanics,
    meta: migrated.meta,
  };
}

/** Apply legacy step payloads onto a sheet (used by block migration). */
export function applyLegacyStep(
  doc: RgdSheetDocument,
  type: RgdBlockType,
  title: string,
  payload: unknown,
): RgdSheetDocument {
  const steps = { ...(doc.steps ?? {}) };
  steps[type] = {
    title: title.trim() || type,
    payload: parsePayload(type, payload) as unknown as Record<string, unknown>,
  };
  // Force remigration from steps.
  const { steps: _drop, mechanics: _m, meta: _meta, ...rest } = doc;
  void _drop;
  void _m;
  void _meta;
  return normalizeRgdSheet({ ...rest, steps });
}

export function summarizeRgdSheet(doc: RgdSheetDocument): string {
  const normalized = normalizeRgdSheet(doc);
  const mechanics = normalized.mechanics ?? [];
  const first = mechanics.find((m) => m.name.trim());
  if (first?.name.trim()) return first.name.trim();
  if (normalized.meta?.goal?.trim()) return normalized.meta.goal.trim();
  const filled = countFilledMechanics(mechanics);
  if (filled) return `${filled} mechanic${filled === 1 ? "" : "s"}`;
  return "Empty RGD sheet";
}

export function filledMechanicCount(doc: RgdSheetDocument): number {
  return countFilledMechanics(normalizeRgdSheet(doc).mechanics ?? []);
}

/** @deprecated Prefer filledMechanicCount — kept for transitional callers. */
export function filledStepCount(doc: RgdSheetDocument): number {
  return filledMechanicCount(doc);
}

/** Ensure every legacy step key exists (for callers still reading steps). */
export function ensureLegacyStepsSkeleton(
  doc: RgdSheetDocument,
): NonNullable<RgdSheetDocument["steps"]> {
  const steps: NonNullable<RgdSheetDocument["steps"]> = {
    ...(doc.steps ?? {}),
  };
  for (const type of RGD_INSERT_ORDER) {
    if (!steps[type]) {
      steps[type] = { title: type, payload: {} };
    }
  }
  return steps;
}
