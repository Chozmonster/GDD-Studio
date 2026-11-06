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
  CloudProjectLink,
  CloudStatus,
  DocSummary,
  DocVariable,
  FlowchartDocument,
  FlowchartSummary,
  HealthStatus,
  MoodBoardDocument,
  ProjectDocument,
  ProjectRecord,
  RemoteEntry,
  RgdSheetDocument,
  RgdSheetSummary,
  SyncResult,
  TemplateRecord,
  UpdateStatus,
} from "./types";

const BROWSER_KEY = "gdd-studio.browser-store";

type BrowserStore = {
  projects: ProjectRecord[];
  settings: AppSettings;
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
  /** projectId → mood board document */
  moodBoards?: Record<string, MoodBoardDocument>;
  /** app-level templates */
  appTemplates?: TemplateRecord[];
  /** projectId → templates */
  projectTemplates?: Record<string, TemplateRecord[]>;
};

function emptyMoodBoard(): MoodBoardDocument {
  return {
    format: "gdd-studio-mood-board",
    version: 1,
    items: [],
  };
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
    },
    update: null,
  };
}

function normalizeSettings(
  settings: Partial<AppSettings> | undefined | null,
): AppSettings {
  return {
    automaticUpdates: settings?.automaticUpdates ?? true,
    lastUpdateCheckAt: settings?.lastUpdateCheckAt ?? null,
    displayVariableNames: settings?.displayVariableNames ?? false,
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
    saveBrowser(store);
    return project;
  }
  return invoke<ProjectRecord>("open_project", { projectId });
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

function browserCloudStatus(): CloudStatus {
  return {
    linked: false,
    providerId: null,
    providerLabel: null,
    accountLabel: null,
    rootFolderId: null,
    autoSyncOnClose: false,
    credentialsConfigured: false,
    linkedProjectCount: 0,
    lastSyncAt: null,
    lastError: null,
    message:
      "Cloud sync requires the desktop app. Browser preview stays local-only.",
  };
}

export async function fetchCloudStatus(): Promise<CloudStatus> {
  if (!isTauriRuntime()) return browserCloudStatus();
  return invoke<CloudStatus>("cloud_status");
}

export async function linkGoogleDrive(): Promise<CloudStatus> {
  if (!isTauriRuntime()) {
    throw new Error("Cloud sync requires the desktop app.");
  }
  return invoke<CloudStatus>("cloud_link_google_drive");
}

export async function unlinkCloud(deleteRemote = false): Promise<CloudStatus> {
  if (!isTauriRuntime()) return browserCloudStatus();
  return invoke<CloudStatus>("cloud_unlink", { deleteRemote });
}

export async function setCloudAutoSyncOnClose(
  enabled: boolean,
): Promise<CloudStatus> {
  if (!isTauriRuntime()) {
    return { ...browserCloudStatus(), autoSyncOnClose: enabled };
  }
  return invoke<CloudStatus>("cloud_set_auto_sync_on_close", { enabled });
}

export async function syncCloudProject(
  projectId: string,
  options?: {
    applyLocalDeletes?: boolean;
    resolutions?: Record<string, string>;
  },
): Promise<SyncResult> {
  if (!isTauriRuntime()) {
    throw new Error("Cloud sync requires the desktop app.");
  }
  return invoke<SyncResult>("cloud_sync_project", {
    projectId,
    applyLocalDeletes: options?.applyLocalDeletes ?? false,
    resolutions: options?.resolutions ?? null,
  });
}

export async function listRemoteCloudProjects(): Promise<RemoteEntry[]> {
  if (!isTauriRuntime()) return [];
  return invoke<RemoteEntry[]>("cloud_list_remote_projects");
}

export async function openProjectFromCloud(
  remoteFolderId: string,
  remoteName: string,
  parentDir: string,
): Promise<ProjectRecord> {
  if (!isTauriRuntime()) {
    throw new Error("Open from cloud requires the desktop app.");
  }
  return invoke<ProjectRecord>("cloud_open_from_cloud", {
    remoteFolderId,
    remoteName,
    parentDir,
  });
}

export async function fetchCloudProjectLink(
  projectId: string,
): Promise<CloudProjectLink | null> {
  if (!isTauriRuntime()) return null;
  return invoke<CloudProjectLink | null>("cloud_project_link", { projectId });
}

export async function checkForUpdates(force: boolean): Promise<UpdateStatus> {
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
        state: "skipped",
        currentVersion: "0.1.1",
        availableVersion: null,
        notes: store.update?.notes ?? null,
        message: "Already checked for updates today.",
        checkedAt: store.settings.lastUpdateCheckAt,
        automaticUpdates: store.settings.automaticUpdates,
      };
    }
    store.settings.lastUpdateCheckAt = now;
    if (simulateUpdateEnv()) {
      const version = "0.1.2-sim";
      const status: UpdateStatus = {
        state: "simulated",
        currentVersion: "0.1.1",
        availableVersion: version,
        notes: simulatedNotes(version),
        message: store.settings.automaticUpdates
          ? "Simulated update available (auto-updates on — would install)."
          : "Simulated update available. Use Install to demo the notify flow.",
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
  return invoke<UpdateStatus>("check_for_updates", { force });
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
  if (!isTauriRuntime()) return;
  await invoke("set_window_role", { role });
}

function emptyFlowchart(id: string): FlowchartDocument {
  return {
    format: "gdd-studio-flowchart",
    version: 2,
    id,
    name: id === "main" ? "Main" : id,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
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
    }));
    if (items.length === 0) {
      return [{ id: "main", name: "Main" }];
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
    return (
      store.flowcharts?.[projectId]?.[flowchartId] ?? emptyFlowchart(flowchartId)
    );
  }
  return invoke<FlowchartDocument>("load_flowchart", {
    projectId,
    flowchartId,
  });
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

export async function loadMoodBoard(
  projectId: string,
): Promise<MoodBoardDocument> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return store.moodBoards?.[projectId] ?? emptyMoodBoard();
  }
  return invoke<MoodBoardDocument>("load_mood_board", { projectId });
}

export async function saveMoodBoard(
  projectId: string,
  document: MoodBoardDocument,
): Promise<MoodBoardDocument> {
  const next: MoodBoardDocument = {
    format: "gdd-studio-mood-board",
    version: 1,
    items: document.items ?? [],
  };
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.moodBoards) store.moodBoards = {};
    store.moodBoards[projectId] = next;
    saveBrowser(store);
    return next;
  }
  return invoke<MoodBoardDocument>("save_mood_board", {
    projectId,
    document: next,
  });
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

export async function writeExportHtml(html: string): Promise<string> {
  if (!isTauriRuntime()) {
    return `browser-export://${nowSecs()}`;
  }
  return invoke<string>("write_export_html", { html });
}
