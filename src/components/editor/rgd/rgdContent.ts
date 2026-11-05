import type {
  AtomicParamRow,
  AtomicParamsPayload,
  GameplayPayload,
  MechanicPayload,
  PatternPayload,
  PillarsPayload,
  RgdBlockType,
  RgdPayloadByType,
  SignsFeedbackPayload,
  SkillsPayload,
} from "./rgdTypes";
import { RGD_INSERT_ORDER, RGD_TYPE_META } from "./rgdTypes";

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

/** TipTap JSON node for one RGD block. */
export function rgdBlockNode(type: RgdBlockType, title?: string) {
  return {
    type: "rgdBlock",
    attrs: {
      rgdType: type,
      title: title ?? defaultTitle(type),
      payload: serializePayload(defaultPayload(type)),
    },
  };
}

/**
 * @deprecated Prefer `buildRgdStarterDoc` + a project RGD sheet.
 * Kept for reference / older callers; inserts seven inline TipTap blocks.
 */
export function buildRgdSkeletonDoc(projectName: string): {
  type: string;
  content: unknown[];
} {
  const intro: PillarsPayload = {
    pillars: ["", "", ""],
    notes: "Define gameplay-only experience pillars before drilling into mechanics.",
  };
  const gameplay: GameplayPayload = {
    gameplay: "",
    goal: "",
    notes: "",
  };
  const mechanic: MechanicPayload = {
    name: "",
    involvesChallenge: true,
    notes: "",
  };
  const skills: SkillsPayload = {
    physical: [],
    mental: [],
    social: [],
    inputs: "",
    notes: "",
  };
  const params: AtomicParamsPayload = {
    rows: [emptyAtomicRow("Parameter 1")],
    notes: "",
  };
  const pattern: PatternPayload = {
    name: "",
    ingredients: "",
    flowchartId: "",
    notes: "Link a flowchart for the level-design layout of this pattern.",
  };
  const signs: SignsFeedbackPayload = {
    signs: "",
    feedback: "",
    notes: "",
  };

  const payloads: Record<RgdBlockType, object> = {
    pillars: intro,
    gameplay,
    mechanic,
    skills,
    atomicParams: params,
    pattern,
    signsFeedback: signs,
  };

  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: projectName || "Game Design Doc" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Rational Game Design starter — fill each section in order (pillars → signs & feedback). Insert more blocks from Insert RGD… anytime.",
          },
        ],
      },
      ...RGD_INSERT_ORDER.map((type) => ({
        type: "rgdBlock",
        attrs: {
          rgdType: type,
          title: defaultTitle(type),
          payload: serializePayload(payloads[type]),
        },
      })),
    ],
  };
}

export function rgdSkeletonNodes(): unknown[] {
  return RGD_INSERT_ORDER.map((type) => rgdBlockNode(type));
}
