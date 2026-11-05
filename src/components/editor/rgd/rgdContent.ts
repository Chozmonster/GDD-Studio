import type {
  AtomicParamRow,
  RgdBlockType,
  RgdPayloadByType,
} from "./rgdTypes";
import { RGD_TYPE_META } from "./rgdTypes";

/** Dispatched to expand a specific RGD block (session UI; detail: `{ pos }`). */
export const RGD_EXPAND_EVENT = "gdd:rgd-expand";

function newId(): string {
  return crypto.randomUUID();
}

export function emptyAtomicRow(name = ""): AtomicParamRow {
  return {
    id: newId(),
    name,
    easy: "",
    medium: "",
    hard: "",
    none: false,
    activeBand: "easy",
  };
}

export function defaultPayload(type: RgdBlockType): RgdPayloadByType[RgdBlockType] {
  switch (type) {
    case "pillars":
      return { pillars: [""], notes: "" };
    case "gameplay":
      return { gameplay: "", goal: "", notes: "" };
    case "mechanic":
      return { name: "", involvesChallenge: true, notes: "" };
    case "skills":
      return { physical: [], mental: [], social: [], inputs: "", notes: "" };
    case "atomicParams":
      return { rows: [emptyAtomicRow()], notes: "" };
    case "pattern":
      return { name: "", ingredients: "", flowchartId: "", notes: "" };
    case "signsFeedback":
      return { signs: "", feedback: "", notes: "" };
  }
}

export function parsePayload<T extends RgdBlockType>(
  type: T,
  raw: unknown,
): RgdPayloadByType[T] {
  const fallback = defaultPayload(type) as RgdPayloadByType[T];
  if (raw == null || raw === "") return fallback;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return fallback;
    }
  }
  if (!parsed || typeof parsed !== "object") return fallback;
  return { ...fallback, ...(parsed as object) } as RgdPayloadByType[T];
}

export function serializePayload(payload: object): string {
  return JSON.stringify(payload);
}

export function defaultTitle(type: RgdBlockType): string {
  return RGD_TYPE_META[type].label;
}
