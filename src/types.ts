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
