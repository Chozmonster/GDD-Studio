import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  HealthStatus,
  ProjectRecord,
  UpdateStatus,
} from "./types";

const BROWSER_KEY = "gdd-studio.browser-store";

type BrowserStore = {
  projects: ProjectRecord[];
  settings: AppSettings;
  update?: UpdateStatus | null;
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
    settings: { automaticUpdates: true, lastUpdateCheckAt: null },
    update: null,
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
  if (!isTauriRuntime()) return loadBrowser().settings;
  return invoke<AppSettings>("get_settings");
}

export async function setAutomaticUpdates(
  enabled: boolean,
): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    const store = loadBrowser();
    store.settings.automaticUpdates = enabled;
    saveBrowser(store);
    return store.settings;
  }
  return invoke<AppSettings>("set_automatic_updates", { enabled });
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
