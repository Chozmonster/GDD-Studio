/** In-app Help copy. RGD text follows docs/rgd-help-sources.md + rgd-integration.md. */

export type HelpSectionId = "app" | "rgd-overview" | "rgd-steps" | "rgd-app";

export type HelpNavItem = {
  id: HelpSectionId;
  label: string;
};

export const HELP_NAV: HelpNavItem[] = [
  { id: "app", label: "How GDD Studio works" },
  { id: "rgd-overview", label: "What is RGD?" },
  { id: "rgd-steps", label: "The 7 steps" },
  { id: "rgd-app", label: "Using RGD here" },
];

export type RgdStepHelp = {
  n: number;
  title: string;
  why: string;
  map: string;
};

/** Canonical 7 steps — plain language from project RGD help sources. */
export const RGD_STEP_HELP: RgdStepHelp[] = [
  {
    n: 1,
    title: "Experience pillars",
    why: "Short gameplay-only promises (pace, readability, tension) that every later choice should serve.",
    map: "Optional sheet context → Pillars. Keep them few and testable.",
  },
  {
    n: 2,
    title: "Gameplay & goal",
    why: "Name the gameplay loop and the player’s objective — what success looks like.",
    map: "Sheet gameplay name (table title) + optional Goal in context.",
  },
  {
    n: 3,
    title: "Mechanic",
    why: "The challenge the human player must overcome (not just a character ability).",
    map: "Form → Mechanic row. Optional player input shows in the table only when set.",
  },
  {
    n: 4,
    title: "Skills & inputs",
    why: "Player skills: Physical (timing, reflexes…), Mental (strategy, observation…), Social (cooperation…). Map to concrete inputs. Input cost is part of difficulty.",
    map: "Form → Player skill under each mechanic (presets available).",
  },
  {
    n: 5,
    title: "Atomic parameters",
    why: "Irreducible, quantifiable difficulty knobs. Pair each with a case — an example of the parameter being tested.",
    map: "Form → Atomic parameter + Case columns (one skill → many params).",
  },
  {
    n: 6,
    title: "Patterns (ingredients)",
    why: "Concrete situations made by combining parameters. Levels are combinations of patterns, not one-off set pieces.",
    map: "Optional context → Pattern fields. Link a flowchart when needed.",
  },
  {
    n: 7,
    title: "Signs & feedback",
    why: "Signs prepare the player before interaction. Feedback confirms after an action. Keep them unambiguous and immediate.",
    map: "Optional context → Signs & feedback.",
  },
];
