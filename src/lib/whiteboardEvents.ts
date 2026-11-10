import type { WhiteboardDocument } from "../types";

/**
 * Live tool → doc bridge for Whiteboard (same pattern as chartEvents /
 * moodBoardEvents). Document embeds subscribe by whiteboardId and never
 * snapshot stroke/shape data.
 */

export type WhiteboardSavedDetail = {
  projectId: string;
  whiteboardId: string;
  document: WhiteboardDocument;
};

export type WhiteboardDeletedDetail = {
  projectId: string;
  whiteboardId: string;
};

const bus = new EventTarget();

export function emitWhiteboardSaved(
  projectId: string,
  whiteboardId: string,
  document: WhiteboardDocument,
) {
  bus.dispatchEvent(
    new CustomEvent<WhiteboardSavedDetail>("whiteboard:saved", {
      detail: { projectId, whiteboardId, document },
    }),
  );
}

export function emitWhiteboardDeleted(
  projectId: string,
  whiteboardId: string,
) {
  bus.dispatchEvent(
    new CustomEvent<WhiteboardDeletedDetail>("whiteboard:deleted", {
      detail: { projectId, whiteboardId },
    }),
  );
}

export function onWhiteboardSaved(
  handler: (detail: WhiteboardSavedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<WhiteboardSavedDetail>).detail);
  };
  bus.addEventListener("whiteboard:saved", listener);
  return () => bus.removeEventListener("whiteboard:saved", listener);
}

export function onWhiteboardDeleted(
  handler: (detail: WhiteboardDeletedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<WhiteboardDeletedDetail>).detail);
  };
  bus.addEventListener("whiteboard:deleted", listener);
  return () => bus.removeEventListener("whiteboard:deleted", listener);
}
