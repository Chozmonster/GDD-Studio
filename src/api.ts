/**
 * Frontend IPC façade for GDD Studio.
 *
 * In Tauri, every call goes through validated Rust commands. The browser
 * branch (localStorage) exists so Vite alone can exercise the UI without the
 * native shell — it must stay behavior-compatible, not become a second product.
 *
 * Asset URLs are produced only via getAssetSrc (Rust-validated path →
 * convertFileSrc). Do not re-export convertFileSrc for arbitrary paths.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { fileToBase64 } from "./lib/bytes";
import type {
  AppSettings,
  AssetRecord,
  ChartDocument,
  ChartSummary,
  DocSummary,
  DocVariable,
  FlowchartDocument,
  FlowchartSummary,
  HealthStatus,
  MoodBoardDocument,
  MoodBoardSummary,
  ProjectDocument,
  ProjectRecord,
  RgdSheetDocument,
  RgdSheetSummary,
  TemplateRecord,
  UpdateStatus,
  WhiteboardDocument,
  WhiteboardSummary,
} from "./types";
import { emptyChartDocument, normalizeChart } from "./components/charts/chartModel";
import {
  emptyWhiteboardDocument,
  normalizeWhiteboard,
} from "./components/whiteboard/whiteboardModel";

const BROWSER_KEY = "gdd-studio.browser-store";

type BrowserStore = {
  projects: ProjectRecord[];
  settings: AppSettings;
  /** Mirrors Rust ActiveSession for browser preview. */
  activeProjectId?: string | null;
  update?: UpdateStatus | null;
  /** projectId → flowchartId → document */
  flowcharts?: Record<string, Record<string, FlowchartDocument>>;
  /** projectId → sheetId → RGD sheet document */
  rgdSheets?: Record<string, Record<string, RgdSheetDocument>>;
  /** projectId → TipTap JSON doc (legacy single-doc; migrated into projectDocs) */
  documents?: Record<string, unknown>;
  /** projectId → documentation variables */
  variables?: Record<string, DocVariable[]>;
  /** projectId → docId → ProjectDocument */
  projectDocs?: Record<string, Record<string, ProjectDocument>>;
  /** projectId → assets */
  assets?: Record<string, AssetRecord[]>;
  /** projectId → assetId → base64 payload */
  assetData?: Record<string, Record<string, string>>;
  /**
   * Browser fallback mood-board library.
   * New shape: projectId → boardId → document.
   * Legacy shape (projectId → single document) is migrated on first read.
   */
  moodBoards?: Record<
    string,
    MoodBoardDocument | Record<string, MoodBoardDocument>
  >;
  /** projectId → chartId → document */
  charts?: Record<string, Record<string, ChartDocument>>;
  /** projectId → whiteboardId → document */
  whiteboards?: Record<string, Record<string, WhiteboardDocument>>;
  /** app-level templates */
  appTemplates?: TemplateRecord[];
  /** projectId → templates */
  projectTemplates?: Record<string, TemplateRecord[]>;
};

function emptyMoodBoard(id = "main"): MoodBoardDocument {
  return {
    format: "gdd-studio-mood-board",
    version: 2,
    id,
    name: id === "main" ? "Main" : id,
    items: [],
  };
}

/** Normalize browser-store mood boards to projectId → boardId → doc. */
function browserMoodBoardLibrary(
  store: BrowserStore,
  projectId: string,
): Record<string, MoodBoardDocument> {
  const raw = store.moodBoards?.[projectId];
  if (!raw) return {};
  // Legacy: a single MoodBoardDocument stored at the project key.
  if (
    typeof raw === "object" &&
    "format" in raw &&
    (raw as MoodBoardDocument).format === "gdd-studio-mood-board"
  ) {
    const legacy = raw as MoodBoardDocument;
    const main: MoodBoardDocument = {
      format: "gdd-studio-mood-board",
      version: 2,
      id: "main",
      name: legacy.name?.trim() || "Main",
      items: legacy.items ?? [],
    };
    if (!store.moodBoards) store.moodBoards = {};
    store.moodBoards[projectId] = { main };
    saveBrowser(store);
    return { main };
  }
  return raw as Record<string, MoodBoardDocument>;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function loadBrowser(): BrowserStore {
  try {
    const raw = localStorage.getItem(BROWSER_KEY);
    if (raw) return JSON.parse(raw) as BrowserStore;
  } catch {
    /* ignore */
  }
  return {
    projects: [],
    settings: {
      automaticUpdates: true,
      lastUpdateCheckAt: null,
      displayVariableNames: false,
      paperSize: "letter",
    },
    update: null,
  };
}

function normalizeSettings(
  settings: Partial<AppSettings> | undefined | null,
): AppSettings {
  const paper =
    typeof settings?.paperSize === "string" && settings.paperSize.trim()
      ? settings.paperSize.trim().toLowerCase()
      : "letter";
  return {
    automaticUpdates: settings?.automaticUpdates ?? true,
    lastUpdateCheckAt: settings?.lastUpdateCheckAt ?? null,
    displayVariableNames: settings?.displayVariableNames ?? false,
    paperSize: paper,
  };
}

function saveBrowser(store: BrowserStore) {
  localStorage.setItem(BROWSER_KEY, JSON.stringify(store));
}

function simulateUpdateEnv(): boolean {
  return (
    import.meta.env.VITE_GDD_SIMULATE_UPDATE === "1" ||
    import.meta.env.VITE_GDD_SIMULATE_UPDATE === "true"
  );
}

function simulatedNotes(version: string): string {
  return `## GDD Studio ${version}\n\n- Godot-style project launcher\n- Options window with automatic updates toggle\n- TipTap editor shell\n\n_Simulated release notes (browser / VITE_GDD_SIMULATE_UPDATE)._`;
}

export async function fetchHealth(): Promise<HealthStatus> {
  if (!isTauriRuntime()) {
    return { ok: true, app: "GDD Studio", version: "0.1.2" };
  }
  return invoke<HealthStatus>("app_health");
}

export async function fetchProjects(): Promise<ProjectRecord[]> {
  if (!isTauriRuntime()) {
    return loadBrowser().projects.slice().sort((a, b) => {
      const ao = a.lastOpenedAt ?? 0;
      const bo = b.lastOpenedAt ?? 0;
      return bo - ao || a.name.localeCompare(b.name);
    });
  }
  return invoke<ProjectRecord[]>("list_projects");
}

export async function createProject(
  name: string,
  parentDir: string,
): Promise<ProjectRecord> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const slug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "gdd-project";
    const path = `${parentDir.replace(/\/$/, "")}/${slug}`;
    const record: ProjectRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      path,
      createdAt: nowSecs(),
      lastOpenedAt: null,
    };
    store.projects.push(record);
    saveBrowser(store);
    return record;
  }
  return invoke<ProjectRecord>("create_project", { name, parentDir });
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    store.projects = store.projects.filter((p) => p.id !== projectId);
    saveBrowser(store);
    return;
  }
  await invoke("delete_project", { projectId });
}

export async function openProject(projectId: string): Promise<ProjectRecord> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project id: ${projectId}`);
    project.lastOpenedAt = nowSecs();
    store.activeProjectId = projectId;
    saveBrowser(store);
    return project;
  }
  return invoke<ProjectRecord>("open_project", { projectId });
}

/** Project open in the editor, if any (null on the launcher). */
export async function fetchActiveProject(): Promise<ProjectRecord | null> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const id = store.activeProjectId;
    if (!id) return null;
    return store.projects.find((p) => p.id === id) ?? null;
  }
  return invoke<ProjectRecord | null>("get_active_project");
}

/**
 * Reveal a project root folder in the OS file manager.
 * Omitting `projectId` uses the editor's active project.
 */
export async function revealProjectFolder(projectId?: string): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const id = projectId ?? store.activeProjectId;
    if (!id) throw new Error("Open a project first.");
    const project = store.projects.find((p) => p.id === id);
    if (!project) throw new Error(`Unknown project id: ${id}`);
    throw new Error(
      `Open project folder is only available in the desktop app.\n${project.path}`,
    );
  }
  await invoke("reveal_project_folder", {
    projectId: projectId ?? null,
  });
}

export async function fetchSettings(): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    return normalizeSettings(loadBrowser().settings);
  }
  return normalizeSettings(await invoke<AppSettings>("get_settings"));
}

export async function setAutomaticUpdates(
  enabled: boolean,
): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    store.settings = normalizeSettings({
      ...store.settings,
      automaticUpdates: enabled,
    });
    saveBrowser(store);
    return store.settings;
  }
  return normalizeSettings(
    await invoke<AppSettings>("set_automatic_updates", { enabled }),
  );
}

export async function setDisplayVariableNames(
  enabled: boolean,
): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    store.settings = normalizeSettings({
      ...store.settings,
      displayVariableNames: enabled,
    });
    saveBrowser(store);
    return store.settings;
  }
  return normalizeSettings(
    await invoke<AppSettings>("set_display_variable_names", { enabled }),
  );
}

export async function setPaperSize(paperSize: string): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    store.settings = normalizeSettings({
      ...store.settings,
      paperSize,
    });
    saveBrowser(store);
    return store.settings;
  }
  return normalizeSettings(
    await invoke<AppSettings>("set_paper_size", { paperSize }),
  );
}

/**
 * Check for updates.
 * @param force Bypass the once-per-day throttle (Options “Check for updates”).
 * @param autoInstall When true and Automatic updates is on, the daily/background
 *   path may download/install. Manual Check must pass `false`.
 */
export async function checkForUpdates(
  force: boolean,
  autoInstall = false,
): Promise<UpdateStatus> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const now = nowSecs();
    const day = 24 * 60 * 60;
    if (
      !force &&
      store.settings.lastUpdateCheckAt &&
      now - store.settings.lastUpdateCheckAt < day &&
      !simulateUpdateEnv()
    ) {
      return {
        state: store.update?.state === "simulated" || store.update?.availableVersion
          ? (store.update?.state ?? "available")
          : "skipped",
        currentVersion: "0.1.1",
        availableVersion: store.update?.availableVersion ?? null,
        notes: store.update?.notes ?? null,
        message: store.update?.availableVersion
          ? "Using today's update check result."
          : "Already checked for updates today.",
        checkedAt: store.settings.lastUpdateCheckAt,
        automaticUpdates: store.settings.automaticUpdates,
      };
    }
    store.settings.lastUpdateCheckAt = now;
    if (simulateUpdateEnv()) {
      const version = "0.1.2-sim";
      const mayAutoInstall = autoInstall && store.settings.automaticUpdates;
      const status: UpdateStatus = {
        state: "simulated",
        currentVersion: "0.1.1",
        availableVersion: version,
        notes: simulatedNotes(version),
        message: mayAutoInstall
          ? "Simulated update available (auto-updates on — would install)."
          : "Simulated update available. Use Download / Install update to apply it.",
        checkedAt: now,
        automaticUpdates: store.settings.automaticUpdates,
      };
      store.update = status;
      saveBrowser(store);
      return status;
    }
    const status: UpdateStatus = {
      state: "error",
      currentVersion: "0.1.1",
      availableVersion: null,
      notes: null,
      message:
        "Browser preview: set VITE_GDD_SIMULATE_UPDATE=1 to demo update UI, or run via Tauri with GitHub Releases.",
      checkedAt: now,
      automaticUpdates: store.settings.automaticUpdates,
    };
    store.update = status;
    saveBrowser(store);
    return status;
  }
  return invoke<UpdateStatus>("check_for_updates", { force, autoInstall });
}

export async function installUpdate(): Promise<UpdateStatus> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const status: UpdateStatus = {
      state: "simulated",
      currentVersion: "0.1.1",
      availableVersion: store.update?.availableVersion ?? "0.1.2-sim",
      notes: store.update?.notes ?? simulatedNotes("0.1.2-sim"),
      message: "Simulated install complete (browser preview).",
      checkedAt: nowSecs(),
      automaticUpdates: store.settings.automaticUpdates,
    };
    store.update = { ...status, state: "upToDate", availableVersion: null };
    saveBrowser(store);
    return status;
  }
  return invoke<UpdateStatus>("install_update");
}

export async function fetchPatchNotes(): Promise<string> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return (
      store.update?.notes ??
      (simulateUpdateEnv()
        ? simulatedNotes("0.1.2-sim")
        : "No patch notes yet. Check for updates first (notes come from the GitHub Release / CHANGELOG body).")
    );
  }
  return invoke<string>("get_patch_notes");
}

export async function openOptionsWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("OPTIONS_MODAL");
  }
  await invoke("open_options_window");
}

export async function defaultProjectsDir(): Promise<string> {
  if (!isTauriRuntime()) {
    return "/home/user/GDD Studio Projects";
  }
  return invoke<string>("default_projects_dir");
}

export async function pickDirectory(
  defaultPath?: string,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return defaultPath ?? "/home/user/GDD Studio Projects";
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
    title: "Choose project folder location",
  });
  if (typeof selected === "string") return selected;
  return null;
}

export function isOptionsWindowRoute(): boolean {
  return new URLSearchParams(window.location.search).get("window") === "options";
}

export type WindowRole = "launcher" | "editor";

/** Tell the native shell which chrome mode owns the main window geometry. */
export async function setWindowRole(role: WindowRole): Promise<void> {
  if (!isTauriRuntime()) {
    if (role === "launcher") {
      const store = loadBrowser();
      store.activeProjectId = null;
      saveBrowser(store);
    }
    return;
  }
  await invoke("set_window_role", { role });
}

function emptyFlowchart(id: string): FlowchartDocument {
  return {
    format: "gdd-studio-flowchart",
    version: 2,
    id,
    name: id === "main" ? "Main" : id,
    description: "",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** Normalize older on-disk JSON that may omit `description`. */
function normalizeFlowchart(doc: FlowchartDocument): FlowchartDocument {
  return {
    ...doc,
    description: typeof doc.description === "string" ? doc.description : "",
  };
}

export async function listFlowcharts(
  projectId: string,
): Promise<FlowchartSummary[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = store.flowcharts?.[projectId] ?? {};
    const items = Object.values(map).map((doc) => ({
      id: doc.id,
      name: doc.name,
      description:
        typeof doc.description === "string" ? doc.description : "",
    }));
    if (items.length === 0) {
      return [{ id: "main", name: "Main", description: "" }];
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }
  return invoke<FlowchartSummary[]>("list_flowcharts", { projectId });
}

export async function loadFlowchart(
  projectId: string,
  flowchartId: string,
): Promise<FlowchartDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return normalizeFlowchart(
      store.flowcharts?.[projectId]?.[flowchartId] ??
        emptyFlowchart(flowchartId),
    );
  }
  const loaded = await invoke<FlowchartDocument>("load_flowchart", {
    projectId,
    flowchartId,
  });
  return normalizeFlowchart(loaded);
}

export async function saveFlowchart(
  projectId: string,
  flowchartId: string,
  document: FlowchartDocument,
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.flowcharts) store.flowcharts = {};
    if (!store.flowcharts[projectId]) store.flowcharts[projectId] = {};
    store.flowcharts[projectId][flowchartId] = document;
    saveBrowser(store);
    return;
  }
  await invoke("save_flowchart", { projectId, flowchartId, document });
}

export async function flowchartExists(
  projectId: string,
  flowchartId: string,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return Boolean(store.flowcharts?.[projectId]?.[flowchartId]);
  }
  return invoke<boolean>("flowchart_exists", { projectId, flowchartId });
}

export async function deleteFlowchart(
  projectId: string,
  flowchartId: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (store.flowcharts?.[projectId]) {
      delete store.flowcharts[projectId][flowchartId];
      saveBrowser(store);
    }
    return;
  }
  await invoke("delete_flowchart", { projectId, flowchartId });
}

export async function saveDocument(
  projectId: string,
  document: unknown,
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.documents) store.documents = {};
    store.documents[projectId] = document;
    saveBrowser(store);
    return;
  }
  await invoke("save_document", { projectId, document });
}

/**
 * Coerce legacy variables.json entries (kind / value_type / numeric value)
 * into plain-text DocVariable records. Drops type fields.
 */
function normalizeVariables(raw: unknown): DocVariable[] {
  if (!Array.isArray(raw)) return [];
  const out: DocVariable[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (!id || !name) continue;
    let value = "";
    if (typeof o.value === "string") value = o.value;
    else if (typeof o.value === "number" && Number.isFinite(o.value)) {
      value = String(o.value);
    } else if (typeof o.value === "boolean") {
      value = String(o.value);
    } else if (o.value != null) {
      value = String(o.value);
    }
    out.push({ id, name, value });
  }
  return out;
}

export async function loadVariables(projectId: string): Promise<DocVariable[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return normalizeVariables(store.variables?.[projectId] ?? []);
  }
  const loaded = await invoke<unknown>("load_variables", { projectId });
  return normalizeVariables(loaded);
}

export async function saveVariables(
  projectId: string,
  variables: DocVariable[],
): Promise<void> {
  // Always persist plain text only — no kind / value_type.
  const plain = normalizeVariables(variables);
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.variables) store.variables = {};
    store.variables[projectId] = plain;
    saveBrowser(store);
    return;
  }
  await invoke("save_variables", { projectId, variables: plain });
}

/** Normalize a typed / panel variable name (spaces → underscores, length cap). */
export function normalizeVariableName(raw: string): string {
  return raw.trim().replace(/\s+/g, "_").slice(0, 48);
}

/**
 * Project-scoped: find a variable by name (case-insensitive) or create it.
 * Used by `{{variablename}}` type-to-insert.
 */
export async function ensureVariable(
  projectId: string,
  rawName: string,
): Promise<{ variable: DocVariable; list: DocVariable[]; created: boolean }> {
  const name = normalizeVariableName(rawName);
  if (!name) {
    throw new Error("Variable name required");
  }
  const list = await loadVariables(projectId);
  const existing = list.find(
    (v) => v.name.toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    return { variable: existing, list, created: false };
  }
  const variable: DocVariable = {
    id: crypto.randomUUID(),
    name,
    value: "",
  };
  const next = [...list, variable];
  await saveVariables(projectId, next);
  return { variable, list: next, created: true };
}

/** Create an empty named flowchart and persist it. */
export async function createFlowchart(
  projectId: string,
  name: string,
): Promise<FlowchartSummary> {
  const trimmed = name.trim() || "Untitled";
  const base =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "flowchart";
  let id = base;
  let n = 2;
  while (await flowchartExists(projectId, id)) {
    id = `${base}-${n++}`;
  }
  const doc = emptyFlowchart(id);
  doc.name = trimmed;
  await saveFlowchart(projectId, id, doc);
  return { id, name: trimmed };
}

function emptyRgdSheet(id: string, name?: string): RgdSheetDocument {
  // Minimal stub for missing files; callers normalize via rgdSheetModel.
  return {
    format: "gdd-studio-rgd-sheet",
    version: 2,
    id,
    name: name ?? (id === "main" ? "Main gameplay" : id),
    primaryFlowchartId: "",
    mechanics: [],
    meta: {},
  };
}

export async function listRgdSheets(
  projectId: string,
): Promise<RgdSheetSummary[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = store.rgdSheets?.[projectId] ?? {};
    return Object.values(map)
      .map((doc) => ({ id: doc.id, name: doc.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return invoke<RgdSheetSummary[]>("list_rgd_sheets", { projectId });
}

export async function loadRgdSheet(
  projectId: string,
  sheetId: string,
): Promise<RgdSheetDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return store.rgdSheets?.[projectId]?.[sheetId] ?? emptyRgdSheet(sheetId);
  }
  return invoke<RgdSheetDocument>("load_rgd_sheet", { projectId, sheetId });
}

export async function saveRgdSheet(
  projectId: string,
  sheetId: string,
  document: RgdSheetDocument,
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.rgdSheets) store.rgdSheets = {};
    if (!store.rgdSheets[projectId]) store.rgdSheets[projectId] = {};
    store.rgdSheets[projectId][sheetId] = document;
    saveBrowser(store);
    return;
  }
  await invoke("save_rgd_sheet", { projectId, sheetId, document });
}

export async function rgdSheetExists(
  projectId: string,
  sheetId: string,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return Boolean(store.rgdSheets?.[projectId]?.[sheetId]);
  }
  return invoke<boolean>("rgd_sheet_exists", { projectId, sheetId });
}

export async function deleteRgdSheet(
  projectId: string,
  sheetId: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (store.rgdSheets?.[projectId]) {
      delete store.rgdSheets[projectId][sheetId];
      saveBrowser(store);
    }
    return;
  }
  await invoke("delete_rgd_sheet", { projectId, sheetId });
}

/** Create an empty named RGD sheet and persist it. */
export async function createRgdSheet(
  projectId: string,
  name: string,
): Promise<RgdSheetSummary> {
  const trimmed = name.trim() || "Untitled gameplay";
  const base =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "rgd-sheet";
  let id = base;
  let n = 2;
  while (await rgdSheetExists(projectId, id)) {
    id = `${base}-${n++}`;
  }
  const doc = emptyRgdSheet(id, trimmed);
  await saveRgdSheet(projectId, id, doc);
  return { id, name: trimmed };
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "untitled";
}

function defaultDocBody(title: string): unknown {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Start writing. Link to another document with [[Doc Title]].",
          },
        ],
      },
    ],
  };
}

function ensureBrowserDocs(store: BrowserStore, projectId: string): Record<string, ProjectDocument> {
  if (!store.projectDocs) store.projectDocs = {};
  if (!store.projectDocs[projectId]) {
    const legacy = store.documents?.[projectId];
    const project = store.projects.find((p) => p.id === projectId);
    const title = project?.name ?? "Untitled document";
    store.projectDocs[projectId] = {
      main: {
        id: "main",
        title,
        slug: "main",
        body: legacy ?? defaultDocBody(title),
        updatedAt: nowSecs(),
        templateId: null,
      },
    };
  }
  return store.projectDocs[projectId];
}

export async function listDocuments(projectId: string): Promise<DocSummary[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = ensureBrowserDocs(store, projectId);
    saveBrowser(store);
    return Object.values(map)
      .map((d) => ({
        id: d.id,
        title: d.title,
        slug: d.slug,
        updatedAt: d.updatedAt,
      }))
      .sort((a, b) => {
        if (a.id === "main") return -1;
        if (b.id === "main") return 1;
        return a.title.localeCompare(b.title);
      });
  }
  return invoke<DocSummary[]>("list_documents", { projectId });
}

export async function loadProjectDocument(
  projectId: string,
  docId: string,
): Promise<ProjectDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = ensureBrowserDocs(store, projectId);
    const doc = map[docId];
    if (!doc) throw new Error(`Unknown document id: ${docId}`);
    return doc;
  }
  return invoke<ProjectDocument>("load_project_document", { projectId, docId });
}

export async function saveProjectDocument(
  projectId: string,
  document: ProjectDocument,
): Promise<ProjectDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = ensureBrowserDocs(store, projectId);
    const next = { ...document, updatedAt: nowSecs() };
    map[document.id] = next;
    if (document.id === "main") {
      if (!store.documents) store.documents = {};
      store.documents[projectId] = document.body;
    }
    saveBrowser(store);
    return next;
  }
  return invoke<ProjectDocument>("save_project_document", {
    projectId,
    document,
  });
}

export async function createProjectDocument(
  projectId: string,
  title: string,
): Promise<ProjectDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = ensureBrowserDocs(store, projectId);
    const trimmed = title.trim() || "Untitled";
    const base = slugify(trimmed);
    let id = base;
    let n = 2;
    while (map[id]) id = `${base}-${n++}`;
    const doc: ProjectDocument = {
      id,
      title: trimmed,
      slug: id,
      body: defaultDocBody(trimmed),
      updatedAt: nowSecs(),
      templateId: null,
    };
    map[id] = doc;
    saveBrowser(store);
    return doc;
  }
  return invoke<ProjectDocument>("create_project_document", {
    projectId,
    title,
  });
}

export async function deleteProjectDocument(
  projectId: string,
  docId: string,
): Promise<void> {
  if (docId === "main") throw new Error("Cannot delete the main document");
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = ensureBrowserDocs(store, projectId);
    delete map[docId];
    saveBrowser(store);
    return;
  }
  await invoke("delete_project_document", { projectId, docId });
}

/** Resolve [[title]] / slug / id to a project document summary. */
export async function resolveWikiSlug(
  projectId: string,
  slugOrTitle: string,
): Promise<DocSummary | null> {
  if (!isTauriRuntime()) {
    const needle = slugOrTitle.trim().toLowerCase();
    if (!needle) return null;
    const docs = await listDocuments(projectId);
    return (
      docs.find(
        (d) =>
          d.slug.toLowerCase() === needle ||
          d.id.toLowerCase() === needle ||
          d.title.toLowerCase() === needle ||
          slugify(d.title) === slugify(needle),
      ) ?? null
    );
  }
  return invoke<DocSummary | null>("resolve_wiki_slug", {
    projectId,
    slugOrTitle,
  });
}

function kindFromMime(mime: string, filename: string): string {
  const m = mime.toLowerCase();
  const lower = filename.toLowerCase();
  if (m.startsWith("image/") || lower.endsWith(".gif")) {
    return m.includes("gif") || lower.endsWith(".gif") ? "gif" : "image";
  }
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (/\.(mp4|webm|mov|mkv)$/i.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(lower)) return "audio";
  return "image";
}

export async function listAssets(projectId: string): Promise<AssetRecord[]> {
  if (!isTauriRuntime()) {
    return (loadBrowser().assets?.[projectId] ?? []).slice();
  }
  return invoke<AssetRecord[]>("list_assets", { projectId });
}

async function saveAsset(
  projectId: string,
  filename: string,
  mime: string,
  dataBase64: string,
): Promise<AssetRecord> {
  const lowerMime = mime.toLowerCase();
  const lowerName = filename.toLowerCase();
  if (
    lowerMime.includes("svg") ||
    lowerName.endsWith(".svg") ||
    lowerName.endsWith(".svgz")
  ) {
    throw new Error(
      "SVG media is not allowed (scriptable XML). Use PNG, JPEG, GIF, WebP, video, or audio.",
    );
  }
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.assets) store.assets = {};
    if (!store.assetData) store.assetData = {};
    if (!store.assets[projectId]) store.assets[projectId] = [];
    if (!store.assetData[projectId]) store.assetData[projectId] = {};
    const id = crypto.randomUUID();
    const kind = kindFromMime(mime, filename);
    const ext =
      filename.split(".").pop()?.toLowerCase() ||
      mime.split("/")[1]?.split(";")[0] ||
      "bin";
    const record: AssetRecord = {
      id,
      kind,
      filename,
      mime,
      byteSize: Math.floor((dataBase64.length * 3) / 4),
      storageRef: `${id}.${ext}`,
      createdAt: nowSecs(),
    };
    store.assets[projectId].push(record);
    store.assetData[projectId][id] = dataBase64;
    saveBrowser(store);
    return record;
  }
  return invoke<AssetRecord>("save_asset", {
    projectId,
    filename,
    mime,
    dataBase64,
  });
}

export async function saveAssetFromFile(
  projectId: string,
  file: File,
): Promise<AssetRecord> {
  const dataBase64 = await fileToBase64(file);
  return saveAsset(
    projectId,
    file.name || "paste.bin",
    file.type || "application/octet-stream",
    dataBase64,
  );
}

export async function getAssetSrc(
  projectId: string,
  assetId: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const record = store.assets?.[projectId]?.find((a) => a.id === assetId);
    const b64 = store.assetData?.[projectId]?.[assetId];
    if (!record || !b64) throw new Error(`Unknown asset id: ${assetId}`);
    const mime = record.mime || "application/octet-stream";
    return `data:${mime};base64,${b64}`;
  }
  try {
    return await invoke<string>("get_asset_data_url", { projectId, assetId });
  } catch {
    const path = await invoke<string>("get_asset_path", { projectId, assetId });
    return convertFileSrc(path);
  }
}

export async function listMoodBoards(
  projectId: string,
): Promise<MoodBoardSummary[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = browserMoodBoardLibrary(store, projectId);
    const items = Object.values(map).map((doc) => ({
      id: doc.id || "main",
      name: doc.name?.trim() || (doc.id === "main" ? "Main" : doc.id || "Untitled"),
    }));
    if (items.length === 0) {
      return [{ id: "main", name: "Main" }];
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }
  return invoke<MoodBoardSummary[]>("list_mood_boards", { projectId });
}

export async function loadMoodBoard(
  projectId: string,
  boardId = "main",
): Promise<MoodBoardDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = browserMoodBoardLibrary(store, projectId);
    return map[boardId] ?? emptyMoodBoard(boardId);
  }
  return invoke<MoodBoardDocument>("load_mood_board", { projectId, boardId });
}

export async function saveMoodBoard(
  projectId: string,
  boardId: string,
  document: MoodBoardDocument,
): Promise<MoodBoardDocument> {
  const next: MoodBoardDocument = {
    format: "gdd-studio-mood-board",
    version: 2,
    id: boardId,
    name: document.name?.trim() || (boardId === "main" ? "Main" : boardId),
    items: document.items ?? [],
  };
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = browserMoodBoardLibrary(store, projectId);
    map[boardId] = next;
    if (!store.moodBoards) store.moodBoards = {};
    store.moodBoards[projectId] = map;
    saveBrowser(store);
    return next;
  }
  return invoke<MoodBoardDocument>("save_mood_board", {
    projectId,
    boardId,
    document: next,
  });
}

export async function moodBoardExists(
  projectId: string,
  boardId: string,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = browserMoodBoardLibrary(store, projectId);
    return Boolean(map[boardId]);
  }
  return invoke<boolean>("mood_board_exists", { projectId, boardId });
}

export async function deleteMoodBoard(
  projectId: string,
  boardId: string,
): Promise<void> {
  if (boardId.trim() === "main") {
    throw new Error("Main mood board cannot be deleted");
  }
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = browserMoodBoardLibrary(store, projectId);
    delete map[boardId];
    if (!store.moodBoards) store.moodBoards = {};
    store.moodBoards[projectId] = map;
    saveBrowser(store);
    return;
  }
  await invoke("delete_mood_board", { projectId, boardId });
}

/** Create an empty named mood board and persist it. */
export async function createMoodBoard(
  projectId: string,
  name: string,
): Promise<MoodBoardSummary> {
  const trimmed = name.trim() || "Untitled";
  const base =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mood-board";
  let id = base;
  let n = 2;
  while (await moodBoardExists(projectId, id)) {
    id = `${base}-${n++}`;
  }
  const doc = emptyMoodBoard(id);
  doc.name = trimmed;
  await saveMoodBoard(projectId, id, doc);
  return { id, name: trimmed };
}

export async function listCharts(projectId: string): Promise<ChartSummary[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = store.charts?.[projectId] ?? {};
    const items = Object.values(map).map((doc) => ({
      id: doc.id,
      name: doc.name?.trim() || doc.id,
    }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    if (items.length === 0) return [{ id: "main", name: "Main" }];
    return items;
  }
  return invoke<ChartSummary[]>("list_charts", { projectId });
}

export async function loadChart(
  projectId: string,
  chartId: string,
): Promise<ChartDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const doc = store.charts?.[projectId]?.[chartId];
    return normalizeChart(doc ?? emptyChartDocument(chartId));
  }
  return normalizeChart(
    await invoke<ChartDocument>("load_chart", { projectId, chartId }),
  );
}

export async function saveChart(
  projectId: string,
  chartId: string,
  document: ChartDocument,
): Promise<ChartDocument> {
  const next = normalizeChart({
    ...document,
    id: chartId,
    format: "gdd-studio-chart",
    version: 1,
  });
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.charts) store.charts = {};
    if (!store.charts[projectId]) store.charts[projectId] = {};
    store.charts[projectId][chartId] = next;
    saveBrowser(store);
    return next;
  }
  return normalizeChart(
    await invoke<ChartDocument>("save_chart", {
      projectId,
      chartId,
      document: next,
    }),
  );
}

export async function chartExists(
  projectId: string,
  chartId: string,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return Boolean(store.charts?.[projectId]?.[chartId]);
  }
  return invoke<boolean>("chart_exists", { projectId, chartId });
}

export async function deleteChart(
  projectId: string,
  chartId: string,
): Promise<void> {
  if (chartId.trim() === "main") {
    throw new Error("Main graph cannot be deleted");
  }
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (store.charts?.[projectId]) {
      delete store.charts[projectId][chartId];
      saveBrowser(store);
    }
    return;
  }
  await invoke("delete_chart", { projectId, chartId });
}

/** Create an empty named chart and persist it. */
export async function createChart(
  projectId: string,
  name: string,
): Promise<ChartSummary> {
  const trimmed = name.trim() || "Untitled";
  const base =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "chart";
  let id = base;
  let n = 2;
  while (await chartExists(projectId, id)) {
    id = `${base}-${n++}`;
  }
  const doc = emptyChartDocument(id, trimmed);
  await saveChart(projectId, id, doc);
  return { id, name: trimmed };
}

export async function listWhiteboards(
  projectId: string,
): Promise<WhiteboardSummary[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const map = store.whiteboards?.[projectId] ?? {};
    const items = Object.values(map).map((doc) => ({
      id: doc.id,
      name: doc.name?.trim() || doc.id,
    }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    if (items.length === 0) return [{ id: "main", name: "Main" }];
    return items;
  }
  return invoke<WhiteboardSummary[]>("list_whiteboards", { projectId });
}

export async function loadWhiteboard(
  projectId: string,
  whiteboardId: string,
): Promise<WhiteboardDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const doc = store.whiteboards?.[projectId]?.[whiteboardId];
    return normalizeWhiteboard(doc ?? emptyWhiteboardDocument(whiteboardId));
  }
  return normalizeWhiteboard(
    await invoke<WhiteboardDocument>("load_whiteboard", {
      projectId,
      whiteboardId,
    }),
  );
}

export async function saveWhiteboard(
  projectId: string,
  whiteboardId: string,
  document: WhiteboardDocument,
): Promise<WhiteboardDocument> {
  const next = normalizeWhiteboard({
    ...document,
    id: whiteboardId,
    format: "gdd-studio-whiteboard",
    version: 1,
  });
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.whiteboards) store.whiteboards = {};
    if (!store.whiteboards[projectId]) store.whiteboards[projectId] = {};
    store.whiteboards[projectId][whiteboardId] = next;
    saveBrowser(store);
    return next;
  }
  return normalizeWhiteboard(
    await invoke<WhiteboardDocument>("save_whiteboard", {
      projectId,
      whiteboardId,
      document: next,
    }),
  );
}

export async function whiteboardExists(
  projectId: string,
  whiteboardId: string,
): Promise<boolean> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return Boolean(store.whiteboards?.[projectId]?.[whiteboardId]);
  }
  return invoke<boolean>("whiteboard_exists", { projectId, whiteboardId });
}

export async function deleteWhiteboard(
  projectId: string,
  whiteboardId: string,
): Promise<void> {
  if (whiteboardId.trim() === "main") {
    throw new Error("Main whiteboard cannot be deleted");
  }
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (store.whiteboards?.[projectId]) {
      delete store.whiteboards[projectId][whiteboardId];
      saveBrowser(store);
    }
    return;
  }
  await invoke("delete_whiteboard", { projectId, whiteboardId });
}

/** Create an empty named whiteboard and persist it. */
export async function createWhiteboard(
  projectId: string,
  name: string,
): Promise<WhiteboardSummary> {
  const trimmed = name.trim() || "Untitled";
  const base =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "whiteboard";
  let id = base;
  let n = 2;
  while (await whiteboardExists(projectId, id)) {
    id = `${base}-${n++}`;
  }
  const doc = emptyWhiteboardDocument(id, trimmed);
  await saveWhiteboard(projectId, id, doc);
  return { id, name: trimmed };
}

/**
 * Resolve which board owns an item id (for legacy embeds that only store
 * moodBoardItemId). Prefers `preferredBoardId`, then main, then any board.
 */
export async function findMoodBoardForItem(
  projectId: string,
  itemId: string,
  preferredBoardId?: string | null,
): Promise<{ boardId: string; document: MoodBoardDocument } | null> {
  if (!itemId) return null;
  const tryBoard = async (boardId: string) => {
    const document = await loadMoodBoard(projectId, boardId);
    if (document.items.some((i) => i.id === itemId)) {
      return { boardId: document.id || boardId, document };
    }
    return null;
  };
  if (preferredBoardId) {
    const hit = await tryBoard(preferredBoardId);
    if (hit) return hit;
  }
  const mainHit = await tryBoard("main");
  if (mainHit) return mainHit;
  const list = await listMoodBoards(projectId);
  for (const summary of list) {
    if (summary.id === "main" || summary.id === preferredBoardId) continue;
    const hit = await tryBoard(summary.id);
    if (hit) return hit;
  }
  return null;
}

export async function listTemplates(
  projectId?: string | null,
): Promise<TemplateRecord[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const app = (store.appTemplates ?? []).map((t) => ({
      ...t,
      scope: "app" as const,
    }));
    const project = projectId
      ? (store.projectTemplates?.[projectId] ?? []).map((t) => ({
          ...t,
          scope: "project" as const,
          projectId,
        }))
      : [];
    return [...app, ...project].sort((a, b) => a.name.localeCompare(b.name));
  }
  return invoke<TemplateRecord[]>("list_templates", {
    projectId: projectId ?? null,
  });
}

export async function saveTemplate(args: {
  name: string;
  body: unknown;
  scope: "app" | "project";
  projectId?: string | null;
  templateId?: string | null;
}): Promise<TemplateRecord> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    const now = nowSecs();
    const id = args.templateId?.trim() || crypto.randomUUID();
    const record: TemplateRecord = {
      id,
      name: args.name.trim(),
      scope: args.scope,
      body: args.body,
      createdAt: now,
      updatedAt: now,
      projectId: args.scope === "project" ? args.projectId ?? null : null,
    };
    if (args.scope === "project") {
      const pid = args.projectId;
      if (!pid) throw new Error("projectId required for project templates");
      if (!store.projectTemplates) store.projectTemplates = {};
      if (!store.projectTemplates[pid]) store.projectTemplates[pid] = [];
      const idx = store.projectTemplates[pid].findIndex((t) => t.id === id);
      if (idx >= 0) {
        record.createdAt = store.projectTemplates[pid][idx].createdAt;
        store.projectTemplates[pid][idx] = record;
      } else {
        store.projectTemplates[pid].push(record);
      }
    } else {
      if (!store.appTemplates) store.appTemplates = [];
      const idx = store.appTemplates.findIndex((t) => t.id === id);
      if (idx >= 0) {
        record.createdAt = store.appTemplates[idx].createdAt;
        store.appTemplates[idx] = record;
      } else {
        store.appTemplates.push(record);
      }
    }
    saveBrowser(store);
    return record;
  }
  return invoke<TemplateRecord>("save_template", {
    name: args.name,
    body: args.body,
    scope: args.scope,
    projectId: args.projectId ?? null,
    templateId: args.templateId ?? null,
  });
}

export async function deleteTemplate(
  templateId: string,
  scope: "app" | "project" | string,
  projectId?: string | null,
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (scope === "project" && projectId) {
      if (store.projectTemplates?.[projectId]) {
        store.projectTemplates[projectId] = store.projectTemplates[
          projectId
        ].filter((t) => t.id !== templateId);
      }
    } else if (store.appTemplates) {
      store.appTemplates = store.appTemplates.filter((t) => t.id !== templateId);
    }
    saveBrowser(store);
    return;
  }
  await invoke("delete_template", {
    templateId,
    scope,
    projectId: projectId ?? null,
  });
}

/** Create `<project>/exports` if needed and return its absolute path. */
export async function ensureProjectExportsDir(projectId: string): Promise<string> {
  if (!isTauriRuntime()) {
    const project = (await fetchActiveProject()) ?? (await fetchProjects()).find((p) => p.id === projectId);
    const root = project?.path?.replace(/[/\\]+$/, "") || `/tmp/gdd-studio/${projectId}`;
    const sep = root.includes("\\") ? "\\" : "/";
    return `${root}${sep}exports`;
  }
  return invoke<string>("ensure_project_exports_dir", { projectId });
}

/** Native save dialog for a PDF; `defaultPath` should include filename. */
export async function pickPdfSavePath(defaultPath: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return defaultPath;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const selected = await save({
    defaultPath,
    title: "Export PDF",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof selected === "string" && selected.trim() ? selected : null;
}

/** Write PDF bytes to a user-chosen absolute path (must end with `.pdf`). */
export async function writeExportPdf(
  path: string,
  data: Uint8Array,
): Promise<string> {
  const dataBase64 = bytesToBase64(data);
  if (!isTauriRuntime()) {
    const blob = new Blob([data], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split(/[/\\]/).pop() || "document.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
    return path;
  }
  return invoke<string>("write_export_pdf", { path, dataBase64 });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
