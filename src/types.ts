export type HealthStatus = {
  ok: boolean;
  app: string;
  version: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastOpenedAt: number | null;
};

export type AppSettings = {
  automaticUpdates: boolean;
  lastUpdateCheckAt: number | null;
  /**
   * When true, variable chips show the name alongside the resolved value.
   * When false (default), chips show the value only; name appears on hover.
   */
  displayVariableNames: boolean;
  /**
   * Paper size for Print view + PDF export (`letter`, `a4`, `legal`, …).
   * Shared by both paths so on-screen pages match print.
   */
  paperSize: string;
};

export type UpdateStatus = {
  state: string;
  currentVersion: string;
  availableVersion: string | null;
  notes: string | null;
  message: string;
  checkedAt: number;
  automaticUpdates: boolean;
};

export type ProjectTab =
  | "document"
  | "flowchart"
  | "rgd"
  | "moodboard"
  | "charts"
  | "whiteboard";

/** Charts MVP — line/bar progression graphs (guttable module). */
export type ChartKind = "line" | "bar";

export type ChartSeries = {
  id: string;
  name: string;
  /** Optional CSS color; UI falls back to a dark-theme palette by index. */
  color?: string;
};

export type ChartRow = {
  id: string;
  /** X value — typically a level index; strings allowed for category bars. */
  x: number | string;
  /** seriesId → Y value (`null` = blank cell). */
  y: Record<string, number | null>;
};

export type ChartSummary = {
  id: string;
  name: string;
};

/** Project-persisted chart (named library entry). */
export type ChartDocument = {
  format: "gdd-studio-chart";
  version: 1;
  id: string;
  name: string;
  /** Designer note — shown under live document embeds. */
  description: string;
  chartType: ChartKind;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  rows: ChartRow[];
};

/** Whiteboard doodle tools (lean MVP — not mini-Miro). */
export type WhiteboardTool =
  | "select"
  | "pen"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse";

export type WhiteboardPoint = {
  x: number;
  y: number;
  /**
   * Pointer Events `pressure` (0–1) sampled while drawing.
   * Mouse / hardware without force typically reports 0.5 → constant brush width.
   * Omitted on legacy boards; treat as 0.5 when rendering.
   */
  pressure?: number;
};

/** Named paint stack entry. Index 0 = bottom; last = top. */
export type WhiteboardLayer = {
  id: string;
  name: string;
  /** When false, layer ink is omitted from editor, embeds, and PDF. */
  visible: boolean;
  /** When true, ink cannot be selected, moved, erased, or drawn onto. */
  locked: boolean;
  /** 0–1 multiply opacity for the whole layer group. */
  opacity: number;
};

/**
 * Freehand brush style for pen strokes.
 * - hard: solid ink (legacy default)
 * - soft: feathered edge (SVG blur)
 * - highlighter: translucent multiply wash
 */
export type WhiteboardBrush = "hard" | "soft" | "highlighter";

/** Freehand stroke (pen ink or eraser brush that punches holes). */
export type WhiteboardPathObject = {
  id: string;
  kind: "path";
  /** Owning layer id (migrated onto a default layer for legacy boards). */
  layerId: string;
  mode: "pen" | "eraser";
  points: WhiteboardPoint[];
  color: string;
  width: number;
  /** Brush style; omitted on legacy paths → hard. */
  brush?: WhiteboardBrush;
  /** Stroke opacity 0–1; omitted → 1. Combined with `flow` when rendering. */
  opacity?: number;
  /** Flow 0–1 (ink density); omitted → 1. Multiplies with opacity. */
  flow?: number;
};

/** Basic shape stroke on the doodle board. */
export type WhiteboardShapeObject = {
  id: string;
  kind: "line" | "rect" | "ellipse";
  /** Owning layer id (migrated onto a default layer for legacy boards). */
  layerId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  /** Optional fill (null/undefined = none). */
  fill?: string | null;
};

export type WhiteboardObject = WhiteboardPathObject | WhiteboardShapeObject;

export type WhiteboardViewport = {
  x: number;
  y: number;
  zoom: number;
};

/**
 * Which Mood Board colour-palette tile feeds Whiteboard stroke/fill swatches.
 * Hex SoT remains the Mood Board item `Palette:` comment — this is a pointer only.
 */
export type WhiteboardPaletteRef = {
  moodBoardId: string;
  itemId: string;
};

export type WhiteboardSummary = {
  id: string;
  name: string;
};

/** Project-persisted whiteboard (named library entry). */
export type WhiteboardDocument = {
  format: "gdd-studio-whiteboard";
  /** 1 = pre-layers MVP; 2 = layers (normalize always writes 2). */
  version: 1 | 2;
  id: string;
  name: string;
  /** Designer note — shown under live document embeds. */
  description: string;
  /** Paint stack; index 0 draws first (bottom). Always ≥1 after normalize. */
  layers: WhiteboardLayer[];
  /** Layer that receives new ink. */
  activeLayerId: string;
  objects: WhiteboardObject[];
  viewport: WhiteboardViewport;
  /** Optional Mood Board palette tile used for stroke/fill swatches. */
  paletteRef?: WhiteboardPaletteRef | null;
};

/** Normalized crop rect over the source image (fractions of natural size). */
export type MoodBoardCrop = {
  /** Left edge [0, 1). */
  x: number;
  /** Top edge [0, 1). */
  y: number;
  /** Width (0, 1]. */
  width: number;
  /** Height (0, 1]. */
  height: number;
};

/** Decorative border applied around the cropped media frame. */
export type MoodBoardBorder = {
  /** Border width in CSS pixels. */
  width: number;
  /** CSS color (hex preferred). */
  color: string;
  /** Optional corner radius in CSS pixels. */
  radius?: number;
};

/** One tile on the project Mood Board (references a project asset). */
export type MoodBoardItem = {
  id: string;
  assetId: string;
  /** Designer note — shown under the tile and on live doc embeds. */
  comment: string;
  createdAt: number;
  /** Image/gif crop — persisted with the item; ignored for video/audio. */
  crop?: MoodBoardCrop | null;
  /** Border framing — persisted with the item. */
  border?: MoodBoardBorder | null;
};

export type MoodBoardSummary = {
  id: string;
  name: string;
};

/** Project-persisted Mood Board (named library entry; scratchpad of reference media). */
export type MoodBoardDocument = {
  format: "gdd-studio-mood-board";
  /** v2 adds id/name for the multi-board library. Legacy v1 files migrate on load. */
  version: 1 | 2;
  id: string;
  name: string;
  items: MoodBoardItem[];
};

export type FlowchartSummary = {
  id: string;
  name: string;
  /** Designer note — shown under the list row and on live doc embeds. */
  description?: string;
};

export type RgdSheetSummary = {
  id: string;
  name: string;
};

/** Optional context retained from the teaching 7-step pack. */
export type RgdSheetMetaDocument = {
  pillars?: string[];
  pillarsNotes?: string;
  goal?: string;
  gameplayNotes?: string;
  patternName?: string;
  patternIngredients?: string;
  patternFlowchartId?: string;
  patternNotes?: string;
  signs?: string;
  feedback?: string;
  signsNotes?: string;
};

/**
 * One gameplay sheet (project-persisted JSON SoT).
 * v2: mechanic → skill → parameter/case table is the hero model.
 * Legacy `steps` may still appear on disk and are migrated on load.
 */
export type RgdSheetDocument = {
  format: string;
  version: number;
  id: string;
  /** Gameplay name — also the live table title. */
  name: string;
  /** Optional primary flowchart link for the sheet. */
  primaryFlowchartId: string;
  /** Mechanic / skill / parameter hierarchy (v2). */
  mechanics?: Array<{
    id: string;
    name: string;
    /** Empty string when the mechanic has no player input. */
    playerInput: string;
    skills: Array<{
      id: string;
      name: string;
      /** Physical | Mental | Social — persisted for table color coding. */
      category: "physical" | "mental" | "social";
      parameters: Array<{
        id: string;
        name: string;
        caseText: string;
      }>;
    }>;
  }>;
  /** Optional pillars / pattern / signs metadata. */
  meta?: RgdSheetMetaDocument;
  /**
   * @deprecated v1 seven-step payloads — migrated into mechanics + meta.
   */
  steps?: Record<
    string,
    {
      title: string;
      /** Type-specific payload object (not a JSON string). */
      payload: Record<string, unknown>;
    }
  >;
};

/** Project-wide named plain-text value (no runtime type). */
export type DocVariable = {
  id: string;
  name: string;
  /** Always a string; legacy number/typed values are coerced on load. */
  value: string;
};

export type DocSummary = {
  id: string;
  title: string;
  slug: string;
  updatedAt: number;
};

export type ProjectDocument = {
  id: string;
  title: string;
  slug: string;
  body: unknown;
  updatedAt: number;
  templateId?: string | null;
};

export type AssetKind = "image" | "gif" | "video" | "audio";

export type AssetRecord = {
  id: string;
  kind: AssetKind | string;
  filename: string;
  mime: string;
  byteSize: number;
  storageRef: string;
  createdAt: number;
};

export type TemplateRecord = {
  id: string;
  name: string;
  scope: "app" | "project" | string;
  body: unknown;
  createdAt: number;
  updatedAt: number;
  projectId?: string | null;
};

export type WordDefinition = {
  word: string;
  phonetic?: string;
  meanings: Array<{
    partOfSpeech: string;
    definitions: Array<{ definition: string; example?: string }>;
  }>;
  source: "cache" | "network" | "builtin";
};

export type FlowchartViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type FlowchartDocument = {
  format: string;
  version: number;
  id: string;
  name: string;
  /** Designer note — shown under live document embeds (Mood Board comment analogue). */
  description: string;
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: {
      label: string;
      kind?: string;
      shape?: string;
      fill?: string;
      width?: number;
      height?: number;
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    type?: string;
    data?: {
      path?: string;
      end?: string;
    };
  }>;
  viewport: FlowchartViewport;
};
