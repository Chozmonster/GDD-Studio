/** Skill presets from Rational Game Design (non-exhaustive lists). */

export const PHYSICAL_SKILLS = [
  "Timing",
  "Reflexes",
  "Precision",
  "Endurance",
  "Measurement",
] as const;

export const MENTAL_SKILLS = [
  "Strategy",
  "Tactics",
  "Management",
  "Logic",
  "Observation",
  "Memorization",
  "Association",
  "Concentration",
] as const;

export const SOCIAL_SKILLS = [
  "Communication",
  "Cooperation",
  "Decision Making",
  "Negotiation",
  "Persuasion",
  "Leadership",
] as const;

export type SkillCategory = "physical" | "mental" | "social";

export const SKILL_PRESETS: Record<SkillCategory, readonly string[]> = {
  physical: PHYSICAL_SKILLS,
  mental: MENTAL_SKILLS,
  social: SOCIAL_SKILLS,
};
