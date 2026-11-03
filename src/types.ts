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

export type ProjectTab = "document" | "flowchart";

export type FlowchartSummary = {
  id: string;
  name: string;
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
    data: { label: string };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
  }>;
  viewport: FlowchartViewport;
};
