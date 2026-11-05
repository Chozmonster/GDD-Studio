import type { RgdSheetDocument } from "../types";

export type RgdSheetSavedDetail = {
  projectId: string;
  sheetId: string;
  document: RgdSheetDocument;
};

export type RgdSheetDeletedDetail = {
  projectId: string;
  sheetId: string;
};

const bus = new EventTarget();

export function emitRgdSheetSaved(
  projectId: string,
  sheetId: string,
  document: RgdSheetDocument,
) {
  bus.dispatchEvent(
    new CustomEvent<RgdSheetSavedDetail>("rgd:saved", {
      detail: { projectId, sheetId, document },
    }),
  );
}

export function emitRgdSheetDeleted(projectId: string, sheetId: string) {
  bus.dispatchEvent(
    new CustomEvent<RgdSheetDeletedDetail>("rgd:deleted", {
      detail: { projectId, sheetId },
    }),
  );
}

export function onRgdSheetSaved(
  handler: (detail: RgdSheetSavedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<RgdSheetSavedDetail>).detail);
  };
  bus.addEventListener("rgd:saved", listener);
  return () => bus.removeEventListener("rgd:saved", listener);
}

export function onRgdSheetDeleted(
  handler: (detail: RgdSheetDeletedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<RgdSheetDeletedDetail>).detail);
  };
  bus.addEventListener("rgd:deleted", listener);
  return () => bus.removeEventListener("rgd:deleted", listener);
}
