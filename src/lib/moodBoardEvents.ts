import type { MoodBoardDocument } from "../types";

/**
 * Live tool → doc bridge for Mood Board (same pattern as flowchartEvents / rgdEvents).
 * Document embeds subscribe by moodBoardItemId and never snapshot crop/border/comment.
 */

export type MoodBoardSavedDetail = {
  projectId: string;
  document: MoodBoardDocument;
};

export type MoodBoardItemDeletedDetail = {
  projectId: string;
  itemId: string;
};

const bus = new EventTarget();

export function emitMoodBoardSaved(
  projectId: string,
  document: MoodBoardDocument,
) {
  bus.dispatchEvent(
    new CustomEvent<MoodBoardSavedDetail>("moodboard:saved", {
      detail: { projectId, document },
    }),
  );
}

export function emitMoodBoardItemDeleted(projectId: string, itemId: string) {
  bus.dispatchEvent(
    new CustomEvent<MoodBoardItemDeletedDetail>("moodboard:item-deleted", {
      detail: { projectId, itemId },
    }),
  );
}

export function onMoodBoardSaved(
  handler: (detail: MoodBoardSavedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<MoodBoardSavedDetail>).detail);
  };
  bus.addEventListener("moodboard:saved", listener);
  return () => bus.removeEventListener("moodboard:saved", listener);
}

export function onMoodBoardItemDeleted(
  handler: (detail: MoodBoardItemDeletedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<MoodBoardItemDeletedDetail>).detail);
  };
  bus.addEventListener("moodboard:item-deleted", listener);
  return () => bus.removeEventListener("moodboard:item-deleted", listener);
}
