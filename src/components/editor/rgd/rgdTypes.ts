/** Rational Game Design block kinds (7 methodology steps). */
export type RgdBlockType =
  | "pillars"
  | "gameplay"
  | "mechanic"
  | "skills"
  | "atomicParams"
  | "pattern"
  | "signsFeedback";

export type DifficultyBand = "easy" | "medium" | "hard" | "none";

export type AtomicParamRow = {
  id: string;
  name: string;
  easy: string;
  medium: string;
  hard: string;
  /** When true, this parameter is unused / no challenge. */
  none: boolean;
  /** Active band highlight (optional documentation cue). */
  activeBand: DifficultyBand;
};

export type PillarsPayload = {
  pillars: string[];
  notes: string;
};

export type GameplayPayload = {
  gameplay: string;
  goal: string;
  notes: string;
};

export type MechanicPayload = {
  name: string;
  /** False = interaction with no skill/params (door, pot, etc.). */
  involvesChallenge: boolean;
  notes: string;
};

export type SkillsPayload = {
  physical: string[];
  mental: string[];
  social: string[];
  inputs: string;
  notes: string;
};

export type AtomicParamsPayload = {
  rows: AtomicParamRow[];
  notes: string;
};

export type PatternPayload = {
  name: string;
  ingredients: string;
  /** Optional linked project flowchart id for the pattern layout. */
  flowchartId: string;
  notes: string;
};

export type SignsFeedbackPayload = {
  signs: string;
  feedback: string;
  notes: string;
};

export type RgdPayloadByType = {
  pillars: PillarsPayload;
  gameplay: GameplayPayload;
  mechanic: MechanicPayload;
  skills: SkillsPayload;
  atomicParams: AtomicParamsPayload;
  pattern: PatternPayload;
  signsFeedback: SignsFeedbackPayload;
};

export type RgdTypeMeta = {
  type: RgdBlockType;
  step: number;
  label: string;
  shortLabel: string;
  description: string;
};

export const RGD_TYPE_META: Record<RgdBlockType, RgdTypeMeta> = {
  pillars: {
    type: "pillars",
    step: 1,
    label: "Experience Pillars",
    shortLabel: "Pillars",
    description: "Gameplay-only experience pillars (top-down).",
  },
  gameplay: {
    type: "gameplay",
    step: 2,
    label: "Gameplay & Goal",
    shortLabel: "Gameplay",
    description: "A gameplay group and its objective.",
  },
  mechanic: {
    type: "mechanic",
    step: 3,
    label: "Mechanic",
    shortLabel: "Mechanic",
    description: "Challenge that can scale difficulty and skills.",
  },
  skills: {
    type: "skills",
    step: 4,
    label: "Skills & Inputs",
    shortLabel: "Skills",
    description: "Physical / Mental / Social skills plus input notes.",
  },
  atomicParams: {
    type: "atomicParams",
    step: 5,
    label: "Atomic Parameters",
    shortLabel: "Params",
    description: "E / M / H / none difficulty parameters.",
  },
  pattern: {
    type: "pattern",
    step: 6,
    label: "Gameplay Pattern",
    shortLabel: "Pattern",
    description: "Ingredient layout; optional flowchart link.",
  },
  signsFeedback: {
    type: "signsFeedback",
    step: 7,
    label: "Signs & Feedback",
    shortLabel: "Signs",
    description: "Readability cues and player feedback.",
  },
};

export const RGD_INSERT_ORDER: RgdBlockType[] = [
  "pillars",
  "gameplay",
  "mechanic",
  "skills",
  "atomicParams",
  "pattern",
  "signsFeedback",
];
