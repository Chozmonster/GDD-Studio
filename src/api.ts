import { invoke } from "@tauri-apps/api/core";
import type { HealthStatus, OpenProjectResult, ProjectSummary } from "./types";

const BROWSER_PROJECTS: ProjectSummary[] = [
  {
    id: "placeholder-demo",
    name: "Demo Project (placeholder)",
    path: null,
  },
  {
    id: "placeholder-empty",
    name: "Empty GDD (placeholder)",
    path: null,
  },
];

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Call Rust IPC; mirror stub responses when running Vite alone outside Tauri. */
export async function fetchHealth(): Promise<HealthStatus> {
  if (!isTauriRuntime()) {
    return { ok: true, app: "GDD Studio", version: "0.1.0" };
  }
  return invoke<HealthStatus>("app_health");
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  if (!isTauriRuntime()) {
    return BROWSER_PROJECTS;
  }
  return invoke<ProjectSummary[]>("list_projects");
}

export async function openProject(projectId: string): Promise<OpenProjectResult> {
  if (!isTauriRuntime()) {
    const project = BROWSER_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Unknown project id: ${projectId}`);
    }
    return {
      project,
      message: "Project open is stubbed — persistence lands in v1. (browser preview)",
    };
  }
  return invoke<OpenProjectResult>("open_project", { projectId });
}
