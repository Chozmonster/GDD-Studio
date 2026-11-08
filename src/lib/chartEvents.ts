import type { ChartDocument } from "../types";

/**
 * Live tool → doc bridge for Charts (same pattern as flowchartEvents /
 * moodBoardEvents / rgdEvents). Document embeds subscribe by chartId and
 * never snapshot table/series data.
 */

export type ChartSavedDetail = {
  projectId: string;
  chartId: string;
  document: ChartDocument;
};

export type ChartDeletedDetail = {
  projectId: string;
  chartId: string;
};

const bus = new EventTarget();

export function emitChartSaved(
  projectId: string,
  chartId: string,
  document: ChartDocument,
) {
  bus.dispatchEvent(
    new CustomEvent<ChartSavedDetail>("chart:saved", {
      detail: { projectId, chartId, document },
    }),
  );
}

export function emitChartDeleted(projectId: string, chartId: string) {
  bus.dispatchEvent(
    new CustomEvent<ChartDeletedDetail>("chart:deleted", {
      detail: { projectId, chartId },
    }),
  );
}

export function onChartSaved(
  handler: (detail: ChartSavedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<ChartSavedDetail>).detail);
  };
  bus.addEventListener("chart:saved", listener);
  return () => bus.removeEventListener("chart:saved", listener);
}

export function onChartDeleted(
  handler: (detail: ChartDeletedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<ChartDeletedDetail>).detail);
  };
  bus.addEventListener("chart:deleted", listener);
  return () => bus.removeEventListener("chart:deleted", listener);
}
