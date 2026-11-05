import type { FlowchartDocument } from "../types";

export type FlowchartSavedDetail = {
  projectId: string;
  flowchartId: string;
  document: FlowchartDocument;
};

export type FlowchartDeletedDetail = {
  projectId: string;
  flowchartId: string;
};

const bus = new EventTarget();

export function emitFlowchartSaved(
  projectId: string,
  flowchartId: string,
  document: FlowchartDocument,
) {
  bus.dispatchEvent(
    new CustomEvent<FlowchartSavedDetail>("flowchart:saved", {
      detail: { projectId, flowchartId, document },
    }),
  );
}

export function emitFlowchartDeleted(projectId: string, flowchartId: string) {
  bus.dispatchEvent(
    new CustomEvent<FlowchartDeletedDetail>("flowchart:deleted", {
      detail: { projectId, flowchartId },
    }),
  );
}

export function onFlowchartSaved(
  handler: (detail: FlowchartSavedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<FlowchartSavedDetail>).detail);
  };
  bus.addEventListener("flowchart:saved", listener);
  return () => bus.removeEventListener("flowchart:saved", listener);
}

export function onFlowchartDeleted(
  handler: (detail: FlowchartDeletedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<FlowchartDeletedDetail>).detail);
  };
  bus.addEventListener("flowchart:deleted", listener);
  return () => bus.removeEventListener("flowchart:deleted", listener);
}
