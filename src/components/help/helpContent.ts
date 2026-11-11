/**
 * In-app Help — single source of truth for nav + section copy.
 * RGD teaching text follows project store docs/rgd-help-sources.md.
 * RGD is one nav chapter / one scrollable page (overview + 7 steps + skills + using the app).
 * Left map is hierarchical: chapters → sections → subsections (indentation in HelpPanel).
 */

import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_META,
  type SkillCategory,
} from "../editor/rgd/rgdPresets";

/** Top-level Help pages (one content pane each). RGD stays a single page. */
export type HelpSectionId =
  | "intro"
  | "document"
  | "flowcharts"
  | "rgd"
  | "moodboard"
  | "charts"
  | "whiteboard"
  | "options";

/** Nested left-map node. Click switches to `section` and scrolls to `anchor` when set. */
export type HelpNavNode = {
  /** Stable id for aria-current / active highlight. */
  id: string;
  label: string;
  section: HelpSectionId;
  /** Element id inside the page (without #). Chapter roots omit this. */
  anchor?: string;
  children?: readonly HelpNavNode[];
};

export const HELP_NAV: readonly HelpNavNode[] = [
  {
    id: "intro",
    label: "Introduction",
    section: "intro",
    children: [
      { id: "intro-what", label: "What GDD Studio is", section: "intro", anchor: "intro-what" },
      {
        id: "intro-launcher",
        label: "Launcher vs editor",
        section: "intro",
        anchor: "intro-launcher",
      },
      {
        id: "intro-projects",
        label: "Projects & documents",
        section: "intro",
        anchor: "intro-projects",
      },
      {
        id: "intro-local",
        label: "Local-first & portable",
        section: "intro",
        anchor: "intro-local",
      },
      {
        id: "intro-embeds",
        label: "Live tool embeds",
        section: "intro",
        anchor: "intro-embeds",
      },
    ],
  },
  {
    id: "document",
    label: "Document",
    section: "document",
    children: [
      {
        id: "document-format",
        label: "Formatting",
        section: "document",
        anchor: "document-format",
      },
      {
        id: "document-lists",
        label: "Lists & alignment",
        section: "document",
        anchor: "document-lists",
      },
      {
        id: "document-font",
        label: "Font & size",
        section: "document",
        anchor: "document-font",
      },
      {
        id: "document-inserts",
        label: "Inserts & embeds",
        section: "document",
        anchor: "document-inserts",
      },
      {
        id: "document-view",
        label: "View, lookup & PDF",
        section: "document",
        anchor: "document-view",
      },
      {
        id: "document-rail",
        label: "Map & documents pane",
        section: "document",
        anchor: "document-rail",
      },
      {
        id: "document-vars",
        label: "Variables",
        section: "document",
        anchor: "document-vars",
      },
    ],
  },
  {
    id: "flowcharts",
    label: "Flowcharts",
    section: "flowcharts",
    children: [
      {
        id: "flowcharts-library",
        label: "Library",
        section: "flowcharts",
        anchor: "flowcharts-library",
      },
      {
        id: "flowcharts-toolbar",
        label: "Toolbar",
        section: "flowcharts",
        anchor: "flowcharts-toolbar",
      },
      {
        id: "flowcharts-nodes",
        label: "Nodes & color",
        section: "flowcharts",
        anchor: "flowcharts-nodes",
      },
      {
        id: "flowcharts-connectors",
        label: "Connectors",
        section: "flowcharts",
        anchor: "flowcharts-connectors",
      },
      {
        id: "flowcharts-canvas",
        label: "Canvas",
        section: "flowcharts",
        anchor: "flowcharts-canvas",
      },
      {
        id: "flowcharts-embeds",
        label: "Document embeds",
        section: "flowcharts",
        anchor: "flowcharts-embeds",
      },
    ],
  },
  {
    id: "rgd",
    label: "Rational Game Design",
    section: "rgd",
    children: [
      { id: "rgd-overview", label: "Overview", section: "rgd", anchor: "rgd-overview" },
      {
        id: "rgd-steps",
        label: "The 7 steps",
        section: "rgd",
        anchor: "rgd-steps",
        children: [
          {
            id: "rgd-step-1",
            label: "1. Experience pillars",
            section: "rgd",
            anchor: "rgd-step-1",
          },
          {
            id: "rgd-step-2",
            label: "2. Gameplay & goal",
            section: "rgd",
            anchor: "rgd-step-2",
          },
          {
            id: "rgd-step-3",
            label: "3. Mechanic",
            section: "rgd",
            anchor: "rgd-step-3",
          },
          {
            id: "rgd-step-4",
            label: "4. Skills & inputs",
            section: "rgd",
            anchor: "rgd-step-4",
          },
          {
            id: "rgd-step-5",
            label: "5. Atomic parameters",
            section: "rgd",
            anchor: "rgd-step-5",
          },
          {
            id: "rgd-step-6",
            label: "6. Patterns",
            section: "rgd",
            anchor: "rgd-step-6",
          },
          {
            id: "rgd-step-7",
            label: "7. Signs & feedback",
            section: "rgd",
            anchor: "rgd-step-7",
          },
        ],
      },
      {
        id: "rgd-skills",
        label: "Player skills",
        section: "rgd",
        anchor: "rgd-skills",
      },
      {
        id: "rgd-app",
        label: "Using RGD here",
        section: "rgd",
        anchor: "rgd-app",
        children: [
          {
            id: "rgd-app-library",
            label: "Sheets & form",
            section: "rgd",
            anchor: "rgd-app-library",
          },
          {
            id: "rgd-app-tables",
            label: "Document tables",
            section: "rgd",
            anchor: "rgd-app-tables",
          },
          {
            id: "rgd-app-flow",
            label: "Flowcharts & starter",
            section: "rgd",
            anchor: "rgd-app-flow",
          },
        ],
      },
    ],
  },
  {
    id: "moodboard",
    label: "Mood Board",
    section: "moodboard",
    children: [
      {
        id: "moodboard-library",
        label: "Library",
        section: "moodboard",
        anchor: "moodboard-library",
      },
      {
        id: "moodboard-toolbar",
        label: "Toolbar",
        section: "moodboard",
        anchor: "moodboard-toolbar",
      },
      {
        id: "moodboard-menu",
        label: "Tile context menu",
        section: "moodboard",
        anchor: "moodboard-menu",
      },
      {
        id: "moodboard-palette",
        label: "Colour palette",
        section: "moodboard",
        anchor: "moodboard-palette",
      },
      {
        id: "moodboard-embeds",
        label: "Document embeds",
        section: "moodboard",
        anchor: "moodboard-embeds",
      },
    ],
  },
  {
    id: "charts",
    label: "Graph",
    section: "charts",
    children: [
      {
        id: "charts-library",
        label: "Library",
        section: "charts",
        anchor: "charts-library",
      },
      {
        id: "charts-formula",
        label: "Formula helper",
        section: "charts",
        anchor: "charts-formula",
      },
      {
        id: "charts-table",
        label: "Values table",
        section: "charts",
        anchor: "charts-table",
      },
      {
        id: "charts-embeds",
        label: "Document embeds",
        section: "charts",
        anchor: "charts-embeds",
      },
    ],
  },
  {
    id: "whiteboard",
    label: "Whiteboard",
    section: "whiteboard",
    children: [
      {
        id: "whiteboard-library",
        label: "Library",
        section: "whiteboard",
        anchor: "whiteboard-library",
      },
      {
        id: "whiteboard-tools",
        label: "Drawing tools",
        section: "whiteboard",
        anchor: "whiteboard-tools",
      },
      {
        id: "whiteboard-palette",
        label: "Mood Board palettes",
        section: "whiteboard",
        anchor: "whiteboard-palette",
      },
      {
        id: "whiteboard-embeds",
        label: "Document embeds",
        section: "whiteboard",
        anchor: "whiteboard-embeds",
      },
    ],
  },
  {
    id: "options",
    label: "Options",
    section: "options",
    children: [
      {
        id: "options-project",
        label: "Project folder",
        section: "options",
        anchor: "options-project",
      },
      {
        id: "options-document",
        label: "Document options",
        section: "options",
        anchor: "options-document",
      },
      {
        id: "options-updates",
        label: "Updates",
        section: "options",
        anchor: "options-updates",
      },
    ],
  },
];

/** Find the chapter root nav id for a section (used when Help opens from a tab). */
export function helpNavRootIdForSection(section: HelpSectionId): string {
  const root = HELP_NAV.find((n) => n.section === section);
  return root?.id ?? "intro";
}

/** Scannable control/button row. */
export type HelpControl = {
  name: string;
  does: string;
  /** Short teaching example — omit unless it clarifies. */
  example?: string;
};

/** Scannable topic block: short lead + controls and/or how-to steps and/or tips. */
export type HelpTopic = {
  title: string;
  /** DOM id for left-map scroll targets (HelpPanel prefixes with help-). */
  anchor?: string;
  lead?: string;
  controls?: readonly HelpControl[];
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

export const HELP_INTRO: HelpArticleContent = {
  title: "Introduction",
  lead: "GDD Studio is a local-first desktop app for writing game design documents with live design tools embedded in the text.",
  topics: [
    {
      title: "What GDD Studio is",
      anchor: "intro-what",
      tips: [
        "A standalone desktop app (not a browser site) for GDDs: rich text, variables, and design tools in one project folder.",
        "Main writing surface is the Document tab. Flowcharts, RGD, Mood Board, Graph, and Whiteboard are sibling tools you can embed live into documents.",
        "Built around Rational Game Design (RGD) as an optional methodology pack — see Rational Game Design in this Help map.",
      ],
    },
    {
      title: "Launcher vs editor",
      anchor: "intro-launcher",
      tips: [
        "Launcher (Project Manager) is projects only: New Project, Edit, Open project folder, Export project archive, Remove, Refresh. Help and Options sit in the chrome.",
        "Editor opens one project. Top tabs: Document, Flowcharts, RGD, Mood Board, Graph, Whiteboard. Help / Options / ← Projects stay in the chrome.",
        "Help opened from a tool tab jumps to that chapter; from the launcher it opens Introduction.",
      ],
    },
    {
      title: "Projects & documents",
      anchor: "intro-projects",
      tips: [
        "A project is a folder on disk with documents plus tool libraries (flowcharts/, rgd/, moodboards/, charts/, whiteboards/, …).",
        "One project can hold many documents. Left rail bottom: Documents list (+ to create, × to delete; the main document cannot be deleted) plus Backlinks for the active doc.",
        "Cross-doc links use [[Doc Title]] or Document toolbar → Link. In-doc jumps use the nested heading map (left rail top).",
      ],
    },
    {
      title: "Local-first & portable",
      anchor: "intro-local",
      tips: [
        "No account for day-to-day work. Data stays in the project folder you choose.",
        "Prefer DIY backup: Options → Open project folder / Export project archive (or the launcher buttons) — copy the folder or save a zip yourself (USB, Drive, Dropbox, etc.). There is no in-app cloud sync.",
        "Distribution prefers a portable zip (run the exe from a folder). Optional installers exist; signed GitHub Releases power automatic updates.",
      ],
    },
    {
      title: "Live tool embeds",
      anchor: "intro-embeds",
      lead: "Tool inserts are references, not snapshots. Edit on the tool tab; every open document embed updates automatically.",
      tips: [
        "From Document: toolbar Flowchart / RGD / Graph / Whiteboard pickers, or Mood Board → right-click → Insert into document.",
        "Embeds are resizable and follow text alignment (left / center / right / justify). PDF export captures tool embeds as images in place.",
        "Broken embeds appear if the linked item or board was deleted — insert again from the toolbar or Mood Board menu.",
      ],
    },
  ],
};

export const HELP_DOCUMENT: HelpArticleContent = {
  title: "Document",
  lead: "The writing surface for your GDD. Formatting toolbar, left map + documents list, right variables panel, and live embeds from every tool tab.",
  topics: [
    {
      title: "Formatting",
      anchor: "document-format",
      lead: "Left cluster on the Document toolbar. Undo/redo applies to this tab only.",
      controls: [
        {
          name: "Undo / Redo",
          does: "Reverse or re-apply rich-text edits on the Document tab.",
          example: "Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z or Ctrl+Y.",
        },
        { name: "Bold", does: "Toggle bold on the selection." },
        { name: "Italic", does: "Toggle italic on the selection." },
        { name: "Underline", does: "Toggle underline on the selection." },
        {
          name: "Heading 1 / 2 / 3",
          does: "Toggle heading level. Headings appear nested in the Document map.",
        },
      ],
    },
    {
      title: "Lists & alignment",
      anchor: "document-lists",
      controls: [
        { name: "Bullet list", does: "Toggle a bulleted list." },
        { name: "Numbered list", does: "Toggle a numbered list." },
        {
          name: "Indent (Tab)",
          does: "Nest the current list item one level deeper when the caret is in a list.",
        },
        {
          name: "Outdent (Shift+Tab)",
          does: "Lift the current list item one level.",
        },
        {
          name: "Align left / center / right / Justify",
          does: "Set paragraph alignment, or align a selected media / tool embed in its frame.",
        },
      ],
    },
    {
      title: "Font & size",
      anchor: "document-font",
      controls: [
        {
          name: "Font",
          does: "Apply a font family to the selection. Empty “Font” clears the override.",
        },
        {
          name: "Size",
          does: "Apply a font size. Empty “Size” clears the override.",
        },
      ],
    },
    {
      title: "Inserts & embeds",
      anchor: "document-inserts",
      lead: "Labeled toolbar actions that insert content at the caret (or after the last Document focus for Mood Board inserts).",
      controls: [
        {
          name: "Flowchart",
          does: "Pick a flowchart to embed as a live, resizable reference.",
        },
        {
          name: "RGD",
          does: "Pick an RGD sheet to embed as a live gameplay table.",
        },
        {
          name: "Graph",
          does: "Pick a Graph library item to embed (UI name Graph; files still live under charts/).",
        },
        {
          name: "Whiteboard",
          does: "Pick a whiteboard to embed; the frame shows the board image only.",
        },
        {
          name: "Media",
          does: "Open a file picker for images, gifs, video, or audio. SVG is not imported. Paste from the clipboard also works.",
        },
        {
          name: "Link",
          does: "Insert a wiki-style link to another document ([[Doc Title]]).",
        },
        {
          name: "Templates",
          does: "Save the active body as an app- or project-scoped template, or apply a template (replaces the body after confirm).",
        },
      ],
      tips: [
        "Standalone Media embeds are independent of Mood Board. Mood Board → Insert into document links a board tile by reference.",
        "Drag an embed’s edge handles to resize; alignment buttons reposition it in the line.",
      ],
    },
    {
      title: "View, lookup & PDF",
      anchor: "document-view",
      controls: [
        {
          name: "Lookup",
          does: "Look up the selected word (definitions panel). Spellcheck underlines stay offline; right-click or Alt+Click for suggestions, Add to dictionary, or Look up.",
        },
        {
          name: "PDF",
          does: "Export a real .pdf via a save dialog. Defaults to the project’s exports/ folder and the document title as filename.",
          example:
            "Uses Options paper size (fit-to-paper width, light print theme). Tool embeds rasterize in place; tall systems maps split into multiple images instead of silent crop; video may show one frame.",
        },
        {
          name: "Continuous",
          does: "Default scroll editor — one continuous page.",
        },
        {
          name: "Print view",
          does: "Editable paper sheets matching Options paper size (Letter, A4, Legal, …).",
        },
        {
          name: "Print view magnification",
          does: "Shown only in Print view: Fit width, Fit page, or 10%–100% in 10% steps. Choice persists on this machine.",
        },
      ],
    },
    {
      title: "Map & documents pane",
      anchor: "document-rail",
      lead: "Left rail: heading map on top, project documents list + backlinks on bottom. Drag the split handles to resize; sizes persist.",
      controls: [
        {
          name: "Document map",
          does: "Nested H1 → H2 → H3 outline of the active doc. Click a heading to jump.",
        },
        {
          name: "Documents → +",
          does: "Create a new document in this project.",
        },
        {
          name: "Documents → row",
          does: "Switch the active document.",
        },
        {
          name: "Documents → ×",
          does: "Delete that document (main document cannot be deleted).",
        },
        {
          name: "Backlinks",
          does: "Lists other documents that [[wiki-link]] to the active document. Click a row to open it.",
        },
      ],
      tips: [
        "There is no section-link picker across docs — use [[Doc Title]] for cross-doc links and the map for in-doc jumps.",
        "Backlinks refresh when you switch docs or save; they scan wikiLink nodes only (not heading map jumps).",
        "On narrow windows, panes stack instead of dragging.",
      ],
    },
    {
      title: "Variables",
      anchor: "document-vars",
      lead: "Project-wide plain text — one registry shared by every document. Values are text only (no type dropdown).",
      controls: [
        {
          name: "Add",
          does: "Create a new variable in the Variables panel.",
        },
        {
          name: "Name / Value fields",
          does: "Edit once; every chip in every document updates live.",
        },
        {
          name: "Insert",
          does: "Insert a chip for that variable at the caret.",
        },
        {
          name: "× (remove)",
          does: "Delete the variable from the registry.",
        },
      ],
      tips: [
        "Type {{name}} in the document to insert (creates the variable if missing).",
        "Chips show the value by default; turn on Options → “Display variable names in document” to show names too (updates live, no reload).",
      ],
      note: "Example: set damage_base = 12 and write “Base damage is {{damage_base}}.” Change the value once when balance shifts.",
    },
  ],
};

export const HELP_FLOWCHARTS: HelpArticleContent = {
  title: "Flowcharts",
  lead: "Named library of diagrams for loops and systems. Miro-like canvas selection; live resizable embeds in Document.",
  topics: [
    {
      title: "Library",
      anchor: "flowcharts-library",
      controls: [
        { name: "New", does: "Create a named flowchart in this project." },
        { name: "List row", does: "Select which flowchart the canvas edits." },
        { name: "Rename", does: "Rename the flowchart." },
        {
          name: "Edit description",
          does: "Optional note under the flowchart; shows beneath every live document embed and updates by reference.",
        },
        {
          name: "Delete",
          does: "Remove the flowchart. Document embeds that targeted it show a broken state.",
        },
      ],
    },
    {
      title: "Toolbar",
      anchor: "flowcharts-toolbar",
      controls: [
        {
          name: "Undo / Redo",
          does: "Reverse canvas edits on this tab only (nodes, edges, styles, labels).",
          example: "Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z or Ctrl+Y.",
        },
        {
          name: "Rename node",
          does: "Edit the selected node’s label (or a node when none of the special cases apply).",
        },
        {
          name: "Edge label",
          does: "Edit the label on the selected connector (prompt). Right-click a connector for the same action.",
        },
        {
          name: "Duplicate",
          does: "Clone the selected node subgraph (nodes plus connectors wholly inside the selection), offset on the canvas.",
          example: "Ctrl/Cmd+D.",
        },
        {
          name: "Delete",
          does: "Delete the current selection (also Backspace / Delete on the canvas). Removes connectors attached to deleted nodes.",
        },
        {
          name: "Save now",
          does: "Force an immediate save (the canvas also autosaves into the project).",
        },
      ],
    },
    {
      title: "Nodes & color",
      anchor: "flowcharts-nodes",
      lead: "One cohesive Nodes menu: semantic types plus base shapes. Same rule for every chip.",
      controls: [
        {
          name: "Start / End / Action / Decision / State",
          does: "With nodes selected: change all of them (and apply that type’s default shape). With none selected: create a new node of that type.",
          example: "Decision creates a diamond; Action creates a rectangle.",
        },
        {
          name: "Rectangle / Rounded / Diamond / Ellipse",
          does: "Change selected nodes’ shape, or create an Action node with that shape when nothing is selected.",
        },
        {
          name: "Color swatches",
          does: "Set fill on the selected node(s). Disabled when nothing is selected.",
        },
        {
          name: "Arrange (L/C/R · T/M/B · Dist H/V)",
          does: "Align 2+ selected nodes, or distribute equal gaps across 3+ nodes.",
        },
      ],
    },
    {
      title: "Connectors",
      anchor: "flowcharts-connectors",
      lead: "Connector chips change the selected edges, or set defaults for new connections (angled + end arrow by default).",
      controls: [
        {
          name: "Curved / Angled",
          does: "Path style for selected connectors, or the default for new ones.",
        },
        {
          name: "Start arrow / End arrow",
          does: "Toggle arrowheads on selected connectors, or the defaults for new ones.",
        },
      ],
      tips: [
        "Drag from a node’s N/E/S/W anchors to connect. Click an anchor to quick-add a connected sibling of the same type.",
        "Drag a connector end onto another node to reconnect.",
        "Nodes snap to a grid so orthogonal connectors stay clean.",
      ],
    },
    {
      title: "Canvas",
      anchor: "flowcharts-canvas",
      tips: [
        "Left-drag empty canvas = marquee select (nodes + connectors).",
        "Click selects; Shift+click adds/toggles; drag moves the selection; click empty clears.",
        "Pan with Space+drag or middle mouse; scroll/pinch to zoom.",
        "Ctrl/Cmd+C / X / V / D = copy / cut / paste / duplicate the selected subgraph.",
        "Right-click a node, connector, or empty pane for Duplicate / Copy / Cut / Delete / Edit label / Paste.",
      ],
    },
    {
      title: "Document embeds",
      anchor: "flowcharts-embeds",
      steps: [
        "Document toolbar → Flowchart → pick a chart.",
        "Edits on the Flowcharts tab update every embed. Resize the frame; use alignment buttons.",
        "The graph stays centered and fitted in the embed (no free pan). Pan remains on the Flowcharts tab.",
      ],
    },
  ],
};

export const HELP_MOOD_BOARD: HelpArticleContent = {
  title: "Mood Board",
  lead: "Named library of reference-media boards. Tile edits (crop, border, comment) live on the board item and refresh every document embed of that tile.",
  topics: [
    {
      title: "Library",
      anchor: "moodboard-library",
      controls: [
        { name: "New", does: "Create another named board (Main cannot be deleted)." },
        { name: "List row", does: "Switch the active board." },
        { name: "Rename", does: "Rename the board." },
        {
          name: "Delete",
          does: "Remove the board. Embeds that targeted its tiles break.",
        },
      ],
      tips: [
        "Existing single-board projects migrate automatically to a Main board with their tiles intact.",
      ],
    },
    {
      title: "Toolbar",
      anchor: "moodboard-toolbar",
      controls: [
        {
          name: "Undo / Redo",
          does: "Reverse tile mutations on this tab only (add, delete, cut/paste, comment, crop, border, colour palette).",
        },
        {
          name: "Add media…",
          does: "File picker for images, gifs, video, or audio (same types as Document Media; no SVG).",
        },
        {
          name: "Paste",
          does: "Paste board clipboard tiles, or OS clipboard files when the board clipboard is empty.",
        },
      ],
      tips: [
        "Drop files on the board surface. Shift+click multi-selects. Focus the board for Delete / Backspace and clipboard shortcuts.",
      ],
    },
    {
      title: "Tile context menu",
      anchor: "moodboard-menu",
      lead: "Right-click a tile (or a multi-selection).",
      controls: [
        {
          name: "Comment…",
          does: "Notes under the tile; also show on live document embeds.",
        },
        {
          name: "Crop…",
          does: "Images/gifs only. Updates open embeds immediately.",
        },
        {
          name: "Border…",
          does: "Width, color, optional radius — live on embeds.",
        },
        { name: "Copy / Cut / Paste / Delete", does: "Clipboard and remove for the selection." },
        {
          name: "Create colour palette…",
          does: "See Colour palette below.",
        },
        {
          name: "Insert into document",
          does: "Embed a live link to this board + tile at the last Document cursor (or end of doc if Document was never focused).",
        },
      ],
    },
    {
      title: "Colour palette",
      anchor: "moodboard-palette",
      steps: [
        "Select one or more image/gif tiles (video/audio are skipped with a status message).",
        "Right-click → Create colour palette… and enter k (number of colours; default 5).",
        "GDD Studio downscales selections off-board (~200×200), runs k-means, drops pure white/black extremes, ranks by dominance, and adds a palette tile.",
      ],
      tips: [
        "Palette tiles show the full set of colour blocks with hex labels (not cropped like photo tiles). Click a block to copy its hex.",
        "Whiteboard reuses these palette tiles as stroke/fill swatches.",
      ],
    },
    {
      title: "Document embeds",
      anchor: "moodboard-embeds",
      tips: [
        "Crop, border, and comment changes propagate automatically; deleting the tile or board breaks the embed.",
        "Open board jumps to the correct named board.",
        "Direct Document paste/Insert media still creates standalone embeds (not Mood Board–linked).",
      ],
      note: "Each board is a grid with comments and basic image edits — not a free-position canvas.",
    },
  ],
};

export const HELP_CHARTS: HelpArticleContent = {
  title: "Graph",
  lead: "Named library of table-driven progression graphs (XP curves, power scaling). Not a spreadsheet and not economy simulation — a guttable MVP for design curves. (UI name Graph; project files still use charts/.)",
  topics: [
    {
      title: "Library",
      anchor: "charts-library",
      controls: [
        { name: "New", does: "Create a graph (Main cannot be deleted)." },
        { name: "List row / Rename / Delete", does: "Switch, rename, or remove graphs. Deleting breaks targeting embeds." },
        {
          name: "Undo / Redo",
          does: "Reverse edits on this tab only (table, series, formula fill, type).",
        },
        {
          name: "Description",
          does: "Optional note stored on the graph (same spirit as flowchart descriptions).",
        },
        {
          name: "Y axis",
          does: "Shared Y-axis label when more than one series exists.",
        },
      ],
    },
    {
      title: "Formula helper",
      anchor: "charts-formula",
      lead: "Always-open pane: formula on the left, preset and type on the right. Live fill is debounced; Apply commits immediately.",
      controls: [
        {
          name: "Formula",
          does: "Freeform expression in x and constants (e.g. a * x^b + c, m*x + b, a * exp(k*x)).",
        },
        {
          name: "Preset",
          does: "Linear, Quadratic, Power, Exponential, Linear-Exponential Hybrid, Logarithmic, Mitigation, Soft Pity Rate, Cumulative Chance, or Custom.",
          example:
            "Presets fill the formula, seed variables/domain/axis labels, and show a short use + design-example blurb. Custom hides the preset-specific blurb.",
        },
        { name: "Type", does: "Line or Bar chart view." },
        {
          name: "Variables chips",
          does: "Numeric constants under the formula. Add detected names, Add variable, or × to remove. x is swept and not listed.",
        },
        {
          name: "x start / x end / step",
          does: "Domain for the independent axis.",
        },
        {
          name: "Series",
          does: "Which Y series the formula writes into.",
        },
        {
          name: "Replace all rows",
          does: "When checked, rebuilds the table; when unchecked, merges Y values into matching X rows.",
        },
        {
          name: "Apply to table",
          does: "Commit the formula fill immediately.",
        },
      ],
      tips: [
        "Supports + − * / ^, parentheses, and functions exp / abs / sqrt / ln / log / sin / cos / tan / min / max / pow.",
      ],
    },
    {
      title: "Values table",
      anchor: "charts-table",
      controls: [
        { name: "Add row", does: "Append an empty data row." },
        { name: "Add series", does: "Add another Y series column." },
        {
          name: "X / Y header inputs",
          does: "Rename the X column and series headers — axes and legend update live, including embeds.",
        },
        { name: "× on series", does: "Remove a series when more than one exists." },
        { name: "Delete (row)", does: "Remove that data row." },
      ],
    },
    {
      title: "Document embeds",
      anchor: "charts-embeds",
      steps: [
        "Document toolbar → Graph inserts a live reference by graph id.",
        "Edits on the Graph tab update every embed. Embeds are resizable and respect text alignment; the plot always fits its frame.",
        "Open in Graph jumps to the referenced graph. PDF export captures embeds as images.",
      ],
      note: "Graphs persist under project/charts/*.json (internal id unchanged) so the module can be removed cleanly if the approach fails.",
    },
  ],
};

export const HELP_WHITEBOARD: HelpArticleContent = {
  title: "Whiteboard",
  lead: "Lean doodle boards for sketches and callouts — not mini-Miro. Named library like Flowcharts / Mood Board / Graph.",
  topics: [
    {
      title: "Library",
      anchor: "whiteboard-library",
      controls: [
        { name: "New", does: "Create a board (Main cannot be deleted)." },
        { name: "List row / Rename / Delete", does: "Switch, rename, or remove boards." },
        {
          name: "Undo / Redo",
          does: "Reverse drawing edits on this tab only.",
        },
        {
          name: "Description",
          does: "Optional note under embeds (same pattern as other libraries).",
        },
      ],
    },
    {
      title: "Drawing tools",
      anchor: "whiteboard-tools",
      lead: "Toolbar icons use hover tooltips. Chrome stays dark; the paper is light.",
      controls: [
        { name: "Select", does: "Move or delete strokes and shapes (Delete / Backspace)." },
        {
          name: "Pen",
          does: "Freehand ink. Pen tablet / stylus uses Pointer Events pressure around the brush size; mouse stays constant width. Variable-width ink persists into embeds and PDF.",
        },
        {
          name: "Eraser",
          does: "Removes any ink the brush overlaps — strokes, lines, and filled or hollow shapes (click inside a shape works).",
        },
        { name: "Line / Rectangle / Ellipse", does: "Basic shape tools." },
        {
          name: "Width",
          does: "Stroke width slider with a live brush-size preview dot.",
        },
        { name: "Stroke / Fill", does: "Colour pickers for stroke and fill." },
        { name: "No fill", does: "Clear fill so shapes are stroke-only." },
      ],
      tips: [
        "Pan with Space+drag, Alt+drag, or middle mouse. Wheel zooms.",
      ],
    },
    {
      title: "Mood Board palettes",
      anchor: "whiteboard-palette",
      controls: [
        {
          name: "Mood Board palette",
          does: "Choose which Mood Board palette feeds the swatches when several exist (defaults to the newest).",
        },
        {
          name: "Swatches",
          does: "Click for stroke colour; Shift+click for fill. Hex source of truth stays on the Mood Board palette tile.",
        },
      ],
    },
    {
      title: "Document embeds",
      anchor: "whiteboard-embeds",
      steps: [
        "Document toolbar → Whiteboard inserts a live reference by board id.",
        "Embeds show only the board image, centered and fitted (like flowchart embeds — no title chrome; double-click opens the board).",
        "Resizable + text alignment; PDF/print captures them as images.",
      ],
      note: "Boards persist under project/whiteboards/*.json. Out of scope for this MVP: multiplayer, tilt, OCR, infinite-canvas polish, importing Mood Board images as layers.",
    },
  ],
};

export const HELP_OPTIONS: HelpArticleContent = {
  title: "Options",
  lead: "Available from the launcher and the editor chrome. Window size/position persists like other windows.",
  topics: [
    {
      title: "Project folder",
      anchor: "options-project",
      controls: [
        {
          name: "Open project folder",
          does: "Reveal the active project folder in your file manager so you can back up or copy it yourself.",
          example:
            "Same action exists on the launcher side panel. There is no in-app cloud sync — DIY backup only.",
        },
        {
          name: "Export project archive",
          does: "Zip the current project folder via a save dialog (default name `<project>-archive.zip` next to the project folder).",
          example:
            "Also on the launcher side panel. Local snapshot only — no OAuth or cloud sync.",
        },
      ],
    },
    {
      title: "Document options",
      anchor: "options-document",
      controls: [
        {
          name: "Display variable names in document",
          does: "When off, chips show the value (name on hover). When on, chips show name and value. Updates live with no reload.",
        },
        {
          name: "Paper size",
          does: "Used by Document Print view and PDF export so on-screen pages match the saved PDF.",
        },
      ],
    },
    {
      title: "Updates",
      anchor: "options-updates",
      controls: [
        {
          name: "Automatic updates",
          does: "When on, check about once per day and install quietly when a signed GitHub Release is available. When off, the launcher notifies you with an Install button.",
        },
        {
          name: "Check for updates",
          does: "Manual check only — never downloads on its own.",
        },
        {
          name: "Download / Install update",
          does: "Enabled only after a check finds an available update.",
        },
        {
          name: "View patch notes",
          does: "Show release notes from the GitHub Release body for the current/available build.",
        },
      ],
      tips: [
        "Updates use the Tauri updater against Chozmonster/GDD-Studio Releases (latest.json + signed artifacts).",
      ],
    },
  ],
};

/** Intro block for the single RGD Help page. */
export const HELP_RGD_OVERVIEW: HelpArticleContent = {
  title: "Rational Game Design",
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
    map: "Form → Player skill + Category under each mechanic. See Player skills below.",
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
  "Teaching scaffold for the methodology. Day-to-day editing centers on the mechanic → skill → parameter table; pillars, patterns, and signs stay optional sheet context. Fill what you need. Industry decks sometimes compress the list — GDD Studio still teaches all seven steps.";

export const HELP_RGD_SKILLS_LEAD =
  "Every skill on an RGD sheet has a required Physical / Mental / Social category. Document table cells are color-coded blue / orange / green to match.";

/** App-usage block for the single RGD Help page (further reading lives here). */
export const HELP_RGD_APP: HelpArticleContent = {
  title: "Using RGD in this app",
  topics: [
    {
      title: "Sheets & form",
      anchor: "rgd-app-library",
      controls: [
        {
          name: "New / Rename / Delete",
          does: "Library of sheets — one per gameplay loop (Combat, Stealth, …), like Flowcharts.",
        },
        {
          name: "Gameplay name",
          does: "Title of the live document table.",
          example: "e.g. Platforming.",
        },
        {
          name: "Undo / Redo",
          does: "Reverse form edits on this tab only. Typing coalesces into one step.",
        },
        {
          name: "Primary flowchart",
          does: "Optional link + Open jumps to the Flowcharts tab.",
        },
        {
          name: "Add mechanic / Add skill / Add parameter",
          does: "Grow the mechanic → skill (with category) → atomic parameter + case table.",
        },
        {
          name: "Optional context",
          does: "Collapsed section for pillars, goal, pattern name/ingredients/flowchart, signs, and feedback.",
        },
      ],
      tips: [
        "Document preview on the right shows the live table as it will embed.",
      ],
    },
    {
      title: "Document tables",
      anchor: "rgd-app-tables",
      steps: [
        "Document toolbar → RGD embeds a live table titled with the gameplay name.",
        "Resize the embed and use text alignment — same spirit as media embeds.",
        "Edits in the RGD tab update every embed. PDF export captures the table as an image.",
      ],
    },
    {
      title: "Flowcharts & starter",
      anchor: "rgd-app-flow",
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

/** @deprecated Prefer HELP_INTRO / HELP_DOCUMENT / HELP_FLOWCHARTS / HELP_OPTIONS. Kept only if anything still imports the old name during transition. */
export const HELP_APP = HELP_INTRO;
