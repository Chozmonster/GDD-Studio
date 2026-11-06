/**
 * In-app Help — single source of truth for nav + section copy.
 * RGD teaching text follows project store docs/rgd-help-sources.md.
 */

import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_META,
  type SkillCategory,
} from "../editor/rgd/rgdPresets";

export type HelpSectionId =
  | "app"
  | "moodboard"
  | "rgd-overview"
  | "rgd-steps"
  | "rgd-skills"
  | "rgd-app";

export type HelpNavItem = {
  id: HelpSectionId;
  label: string;
};

export const HELP_NAV: HelpNavItem[] = [
  { id: "app", label: "How GDD Studio works" },
  { id: "moodboard", label: "Mood Board" },
  { id: "rgd-overview", label: "What is RGD?" },
  { id: "rgd-steps", label: "The 7 steps" },
  { id: "rgd-skills", label: "Player skills" },
  { id: "rgd-app", label: "Using RGD here" },
];

/** Scannable topic block: short lead + how-to steps and/or tip bullets. */
export type HelpTopic = {
  title: string;
  lead?: string;
  /** Numbered how-to steps (preferred for procedures). */
  steps?: readonly string[];
  /** Short unordered tips. */
  tips?: readonly string[];
  note?: string;
};

export type HelpArticleContent = {
  title: string;
  lead?: string;
  topics?: readonly HelpTopic[];
  /** Closing footnote (attribution, scope). */
  footnote?: string;
  furtherReading?: readonly string[];
};

export const HELP_APP: HelpArticleContent = {
  title: "How GDD Studio works",
  lead: "Local-first game design docs. Projects live on disk — no account for v1.",
  topics: [
    {
      title: "Projects",
      tips: [
        "Launcher is projects only: create, open, or remove.",
        "Options (launcher or editor): automatic updates, “Display variable names in document”, and Open project folder (DIY backup — no in-app cloud sync).",
        "Open Help from the launcher or the editor chrome.",
      ],
    },
    {
      title: "Documents",
      steps: [
        "Use the Documents pane (left rail, bottom) to create, switch, or delete docs. The main document cannot be deleted.",
        "Document map (left rail, top) nests headings by level (H1 → H2 → H3) — click to jump within the active doc.",
        "Link across docs with [[Doc Title]] (or toolbar Link). There is no section-link picker; use the map for in-doc jumps.",
        "Drag pane handles to resize (map|docs, editor|variables, tool lists). Sizes persist; narrow windows stack instead of dragging.",
      ],
    },
    {
      title: "Variables",
      lead: "Project-wide plain text — one registry shared by every document.",
      steps: [
        "Type {{name}} in the doc (creates the variable if missing), or use the Variables panel Insert.",
        "Edit a value once; every chip updates live.",
        "Chips show the value by default; turn on “Display variable names in document” in Options to show names too (no reload).",
      ],
    },
    {
      title: "Flowcharts",
      steps: [
        "Open the Flowcharts tab — named list + canvas.",
        "Canvas inputs follow Miro: left-drag empty area marquees nodes and connectors; click selects; Shift+click adds/toggles; drag a selection to move it; click empty clears. Pan with Space+drag or middle mouse (scroll/pinch zoom).",
        "Nodes toolbar (Start / End / Action / Decision / State plus Rectangle / Rounded / Diamond / Ellipse): with nodes selected they change all of them; with none selected they create. Types also apply their default shape (e.g. Decision → diamond).",
        "Connector toolbar (Curved / Angled, Start / End arrow): changes selected edges, or sets defaults for new connections (angled + end arrow by default). Drag a connector end onto another node to reconnect.",
        "Insert a live embed into the active document from the flowchart tools. Embeds stay centered and fitted in their frame (no drag-pan); the Flowcharts tab keeps Miro-like panning.",
        "Description (sidebar) — optional note under each flowchart; shows beneath live document embeds and updates by reference.",
      ],
    },
    {
      title: "Live tool → document embeds",
      lead: "Flowcharts, RGD tables, and Mood Board inserts are references, not snapshots. Edits in those tabs update every open document embed automatically.",
      tips: [
        "Flowchart embeds re-fit when the chart or embed size changes so the graph stays centered — they do not free-pan.",
        "Flowchart descriptions edit from the Flowcharts list and appear under every embed of that chart.",
        "RGD and Mood Board details: see Using RGD here and Mood Board.",
      ],
    },
    {
      title: "Media, templates, spellcheck, PDF",
      tips: [
        "Media — paste or Insert media (images, gifs, video, audio). Embeds are resizable and follow text alignment. SVG files are not imported.",
        "Templates — save the active body as an app- or project-scoped template; apply replaces the current body (confirm).",
        "Spellcheck — offline underlines. Right-click or Alt+Click for suggestions, Add to dictionary, or Look up. Toolbar Look up opens definitions.",
        "Export PDF — print dialog (Save as PDF). Flowchart and RGD embeds are captured as screenshots in place; images export normally; video may show a single frame.",
      ],
    },
  ],
};

export const HELP_MOOD_BOARD: HelpArticleContent = {
  title: "Mood Board",
  lead: "Named library of reference-media boards (like Flowcharts). Tile edits (crop, border, comment) live on the board item and refresh every document embed of that tile.",
  topics: [
    {
      title: "Multiple boards",
      steps: [
        "Use the left list to create, rename, delete, or switch boards (Main cannot be deleted).",
        "Existing single-board projects migrate automatically to a Main board with their tiles intact.",
      ],
    },
    {
      title: "Add & arrange",
      steps: [
        "Drop files on the active board, paste from the OS clipboard, or use Add media…",
        "Copy / Cut / Paste / Delete selected tiles (context menu or shortcuts when the board is focused). Paste also imports OS clipboard files when the board clipboard is empty.",
      ],
    },
    {
      title: "Tile edits",
      tips: [
        "Comment — right-click → Comment. Notes show under the tile and on live doc embeds.",
        "Crop… — images/gifs. Border… — width, color, optional radius. Changes update open document embeds immediately.",
        "Shift+click to multi-select tiles.",
      ],
    },
    {
      title: "Create colour palette",
      steps: [
        "Select one or more image/gif tiles (video/audio are skipped with a status message).",
        "Right-click → Create colour palette… and enter k (number of colours; default 5).",
        "GDD Studio downscales selections off-board (~200×200), runs k-means, drops pure white/black extremes, ranks by dominance, and adds a new labeled palette image tile to the current board.",
        "Click a hex chip under the palette tile to copy that colour.",
      ],
    },
    {
      title: "Insert into Document",
      steps: [
        "Right-click a tile → Insert into Document. Embeds a live link to that board + tile at the last Document cursor (or end of doc if Document was never focused).",
        "Crop, border, and comment changes propagate automatically; deleting the tile (or its board) breaks the embed. Open board jumps to the correct named board.",
      ],
      note: "Each board is a grid with comments and basic image edits — not a free-position canvas. Direct Document paste/Insert media still creates standalone embeds (not Mood Board-linked). Those media embeds are also resizable and alignment-aware.",
    },
  ],
};

export const HELP_RGD_OVERVIEW: HelpArticleContent = {
  title: "What is Rational Game Design?",
  lead: "A Ubisoft-origin methodology for rationalizing gameplay: strip a challenge to skills, inputs, and measurable atomic parameters, then recombine those into patterns with readable signs and feedback. Goal: intentional difficulty and variety — not feel-based tweaks alone.",
  topics: [
    {
      title: "Form vs function",
      tips: [
        "Function = skills, inputs, parameters.",
        "Form = art, story, and aesthetics that communicate those functions.",
      ],
    },
  ],
  footnote:
    "A design lens for documentation — GDD Studio does not add telemetry or auto-balance. Methods associated with Ubisoft practice and public writeups (e.g. McEntee 2012); not an official Ubisoft product endorsement.",
};

export type SkillHelpCategory = {
  id: SkillCategory;
  label: string;
  definition: string;
  examples: readonly string[];
};

export const RGD_SKILL_HELP: SkillHelpCategory[] = SKILL_CATEGORIES.map(
  (id) => SKILL_CATEGORY_META[id],
);

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
    map: "Form → Player skill + Category under each mechanic. See Help → Player skills.",
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

export const HELP_RGD_STEPS_LEAD =
  "Teaching scaffold for the methodology. Day-to-day editing centers on the mechanic → skill → parameter table; pillars, patterns, and signs stay optional sheet context. Fill what you need.";

export const HELP_RGD_SKILLS_LEAD =
  "Every skill on an RGD sheet has a required Physical / Mental / Social category. Document table cells are color-coded blue / orange / green to match.";

export const HELP_RGD_APP: HelpArticleContent = {
  title: "Using RGD in this app",
  topics: [
    {
      title: "Sheets library",
      steps: [
        "Open the RGD tab — one sheet per gameplay loop (Combat, Stealth, …), like the Flowcharts library.",
        "Edit as a form: mechanics, optional player input, skills (with category), atomic parameters, and cases.",
        "Optional pillars / pattern / signs live in a collapsed context section.",
      ],
    },
    {
      title: "Document tables",
      steps: [
        "Insert RGD… embeds a live table titled with the gameplay name.",
        "Resize the embed and use text alignment — same spirit as media embeds.",
        "Edits in the RGD tab update every embed. PDF export captures the table as an image.",
      ],
    },
    {
      title: "Flowcharts & starter",
      tips: [
        "Link a primary or pattern flowchart from the sheet; Open jumps to the Flowcharts tab.",
        "New Project can include an RGD starter sheet — RGD is never forced on every project.",
      ],
    },
  ],
  furtherReading: [
    "Chris McEntee — “Rational Design: The Core of Rayman Origins” (Game Developer, 2012)",
    "Project PDF: Rational Game Design intro (in project docs)",
  ],
};
