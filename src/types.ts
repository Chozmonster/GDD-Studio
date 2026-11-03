export type HealthStatus = {
  ok: boolean;
  app: string;
  version: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  path: string | null;
};

export type OpenProjectResult = {
  project: ProjectSummary;
  message: string;
};
