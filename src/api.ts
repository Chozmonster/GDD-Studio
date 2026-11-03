import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  DocVariable,
  FlowchartDocument,
  FlowchartSummary,
  HealthStatus,
  ProjectRecord,
  UpdateStatus,
} from "./types";

const BROWSER_KEY = "gdd-studio.browser-store";

type BrowserStore = {
  projects: ProjectRecord[];
  settings: AppSettings;
  update?: UpdateStatus | null;
  /** projectId → flowchartId → document */
  flowcharts?: Record<string, Record<string, FlowchartDocument>>;
  /** projectId → TipTap JSON doc */
  documents?: Record<string, unknown>;
  /** projectId → documentation variables */
  variables?: Record<string, DocVariable[]>;
};

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
    return { ok: true, app: "GDD Studio", version: "0.1.0" };
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
        currentVersion: "0.1.0",
        availableVersion: null,
        notes: null,
        message: "Already checked for updates today.",
        checkedAt: store.settings.lastUpdateCheckAt,
        automaticUpdates: store.settings.automaticUpdates,
      };
    }
    store.settings.lastUpdateCheckAt = now;
    if (simulateUpdateEnv()) {
      const version = "0.1.1-sim";
      const status: UpdateStatus = {
        state: "simulated",
        currentVersion: "0.1.0",
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
      currentVersion: "0.1.0",
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
      currentVersion: "0.1.0",
      availableVersion: store.update?.availableVersion ?? "0.1.1-sim",
      notes: store.update?.notes ?? simulatedNotes("0.1.1-sim"),
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
        ? simulatedNotes("0.1.1-sim")
        : "No patch notes yet. Check for updates first.")
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

export async function loadDocument(projectId: string): Promise<unknown> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (store.documents?.[projectId]) return store.documents[projectId];
    return {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Untitled document" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Start writing your game design doc. Use Insert flowchart to embed a live diagram.",
            },
          ],
        },
      ],
    };
  }
  return invoke("load_document", { projectId });
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

export async function loadVariables(projectId: string): Promise<DocVariable[]> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    return (store.variables?.[projectId] ?? []).slice();
  }
  return invoke<DocVariable[]>("load_variables", { projectId });
}

export async function saveVariables(
  projectId: string,
  variables: DocVariable[],
): Promise<void> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    if (!store.variables) store.variables = {};
    store.variables[projectId] = variables;
    saveBrowser(store);
    return;
  }
  await invoke("save_variables", { projectId, variables });
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
