/** Skill presets from Rational Game Design (non-exhaustive lists). */

const PHYSICAL_SKILLS = [
  "Timing",
  "Reflexes",
  "Precision",
  "Endurance",
  "Measurement",
] as const;

const MENTAL_SKILLS = [
  "Strategy",
  "Tactics",
  "Management",
  "Logic",
  "Observation",
  "Memorization",
  "Association",
  "Concentration",
] as const;

const SOCIAL_SKILLS = [
  "Communication",
  "Cooperation",
  "Decision Making",
  "Negotiation",
  "Persuasion",
  "Leadership",
] as const;

export type SkillCategory = "physical" | "mental" | "social";

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  "physical",
  "mental",
  "social",
] as const;

export const SKILL_PRESETS: Record<SkillCategory, readonly string[]> = {
  physical: PHYSICAL_SKILLS,
  mental: MENTAL_SKILLS,
  social: SOCIAL_SKILLS,
};

export type SkillCategoryMeta = {
  id: SkillCategory;
  label: string;
  definition: string;
  examples: readonly string[];
};

/** Help / form copy aligned with the Player Skills reference chart. */
export const SKILL_CATEGORY_META: Record<SkillCategory, SkillCategoryMeta> = {
  physical: {
    id: "physical",
    label: "Physical",
    definition: "Challenge players' motor skills and reaction times",
    examples: PHYSICAL_SKILLS,
  },
  mental: {
    id: "mental",
    label: "Mental",
    definition: "Challenge players' logic and reasoning",
    examples: MENTAL_SKILLS,
  },
  social: {
    id: "social",
    label: "Social",
    definition:
      "Challenge players' social intelligence in relation to other players",
    examples: SOCIAL_SKILLS,
  },
};

const PRESET_TO_CATEGORY = new Map<string, SkillCategory>();
for (const cat of SKILL_CATEGORIES) {
  for (const name of SKILL_PRESETS[cat]) {
    PRESET_TO_CATEGORY.set(name.toLowerCase(), cat);
  }
}

function isSkillCategory(value: unknown): value is SkillCategory {
  return value === "physical" || value === "mental" || value === "social";
}

/** Infer category from a known preset name; default Physical. */
function inferSkillCategory(name: string): SkillCategory {
  const key = name.trim().toLowerCase();
  if (!key) return "physical";
  return PRESET_TO_CATEGORY.get(key) ?? "physical";
}

export function parseSkillCategory(
  value: unknown,
  fallbackName = "",
): SkillCategory {
  if (isSkillCategory(value)) return value;
  return inferSkillCategory(fallbackName);
}
