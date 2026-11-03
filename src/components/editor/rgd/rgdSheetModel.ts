import type { RgdSheetDocument } from "../../../types";
import {
  defaultPayload,
  defaultTitle,
  parsePayload,
} from "./rgdContent";
import type { RgdBlockType, RgdPayloadByType } from "./rgdTypes";
import { RGD_INSERT_ORDER } from "./rgdTypes";

export type RgdSheetStep<T extends RgdBlockType = RgdBlockType> = {
  title: string;
  payload: RgdPayloadByType[T];
};

export function emptyRgdSheetDocument(
  id: string,
  name?: string,
): RgdSheetDocument {
  const steps: RgdSheetDocument["steps"] = {};
  for (const type of RGD_INSERT_ORDER) {
    steps[type] = {
      title: defaultTitle(type),
      payload: defaultPayload(type) as unknown as Record<string, unknown>,
    };
  }
  return {
    format: "gdd-studio-rgd-sheet",
    version: 1,
    id,
    name: name ?? (id === "main" ? "Main gameplay" : id),
    primaryFlowchartId: "",
    steps,
  };
}

/** Ensure every RGD step exists with a typed payload. */
export function normalizeRgdSheet(doc: RgdSheetDocument): RgdSheetDocument {
  const steps: RgdSheetDocument["steps"] = { ...(doc.steps ?? {}) };
  for (const type of RGD_INSERT_ORDER) {
    const raw = steps[type];
    steps[type] = {
      title:
        typeof raw?.title === "string" && raw.title.trim()
          ? raw.title
          : defaultTitle(type),
      payload: parsePayload(type, raw?.payload) as unknown as Record<
        string,
        unknown
      >,
    };
  }
  return {
    format: doc.format || "gdd-studio-rgd-sheet",
    version: typeof doc.version === "number" ? doc.version : 1,
    id: doc.id,
    name: doc.name || doc.id,
    primaryFlowchartId: doc.primaryFlowchartId ?? "",
    steps,
  };
}

export function getSheetStep<T extends RgdBlockType>(
  doc: RgdSheetDocument,
  type: T,
): RgdSheetStep<T> {
  const normalized = normalizeRgdSheet(doc);
  const step = normalized.steps[type]!;
  return {
    title: step.title,
    payload: parsePayload(type, step.payload),
  };
}

export function setSheetStep<T extends RgdBlockType>(
  doc: RgdSheetDocument,
  type: T,
  step: RgdSheetStep<T>,
): RgdSheetDocument {
  const next = normalizeRgdSheet(doc);
  return {
    ...next,
    steps: {
      ...next.steps,
      [type]: {
        title: step.title,
        payload: step.payload as unknown as Record<string, unknown>,
      },
    },
  };
}

/** One-line summary for compact card embeds. */
export function summarizeRgdSheet(doc: RgdSheetDocument): string {
  const normalized = normalizeRgdSheet(doc);
  const gameplay = parsePayload(
    "gameplay",
    normalized.steps.gameplay?.payload,
  );
  if (gameplay.gameplay.trim()) return gameplay.gameplay.trim();
  const mechanic = parsePayload(
    "mechanic",
    normalized.steps.mechanic?.payload,
  );
  if (mechanic.name.trim()) return mechanic.name.trim();
  const pillars = parsePayload("pillars", normalized.steps.pillars?.payload);
  const filled = pillars.pillars.map((p) => p.trim()).filter(Boolean);
  if (filled.length) return filled.slice(0, 2).join(" · ");
  return "7 RGD steps";
}

export function filledStepCount(doc: RgdSheetDocument): number {
  const normalized = normalizeRgdSheet(doc);
  let n = 0;
  for (const type of RGD_INSERT_ORDER) {
    const payload = parsePayload(type, normalized.steps[type]?.payload);
    if (stepLooksFilled(type, payload)) n += 1;
  }
  return n;
}

function stepLooksFilled(
  type: RgdBlockType,
  payload: RgdPayloadByType[RgdBlockType],
): boolean {
  switch (type) {
    case "pillars": {
      const p = payload as RgdPayloadByType["pillars"];
      return p.pillars.some((s) => s.trim()) || Boolean(p.notes.trim());
    }
    case "gameplay": {
      const p = payload as RgdPayloadByType["gameplay"];
      return Boolean(p.gameplay.trim() || p.goal.trim() || p.notes.trim());
    }
    case "mechanic": {
      const p = payload as RgdPayloadByType["mechanic"];
      return Boolean(p.name.trim() || p.notes.trim());
    }
    case "skills": {
      const p = payload as RgdPayloadByType["skills"];
      return (
        p.physical.length + p.mental.length + p.social.length > 0 ||
        Boolean(p.inputs.trim() || p.notes.trim())
      );
    }
    case "atomicParams": {
      const p = payload as RgdPayloadByType["atomicParams"];
      return (
        p.rows.some(
          (r) =>
            r.name.trim() ||
            r.easy.trim() ||
            r.medium.trim() ||
            r.hard.trim(),
        ) || Boolean(p.notes.trim())
      );
    }
    case "pattern": {
      const p = payload as RgdPayloadByType["pattern"];
      return Boolean(
        p.name.trim() ||
          p.ingredients.trim() ||
          p.flowchartId.trim() ||
          p.notes.trim(),
      );
    }
    case "signsFeedback": {
      const p = payload as RgdPayloadByType["signsFeedback"];
      return Boolean(p.signs.trim() || p.feedback.trim() || p.notes.trim());
    }
  }
}
