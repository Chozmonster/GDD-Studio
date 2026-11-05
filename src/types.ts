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

export type View = "launcher" | "editor";

export type ProjectTab = "document" | "flowchart" | "rgd" | "moodboard";

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

/** Project-persisted Mood Board (scratchpad of reference media). */
export type MoodBoardDocument = {
  format: "gdd-studio-mood-board";
  version: 1;
  items: MoodBoardItem[];
};

export type FlowchartSummary = {
  id: string;
  name: string;
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
