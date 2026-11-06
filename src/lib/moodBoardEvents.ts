import type { MoodBoardDocument } from "../types";

/**
 * Live tool → doc bridge for Mood Board (same pattern as flowchartEvents / rgdEvents).
 * Document embeds subscribe by moodBoardId + moodBoardItemId and never snapshot
 * crop/border/comment.
 */

export type MoodBoardSavedDetail = {
  projectId: string;
  boardId: string;
  document: MoodBoardDocument;
};

export type MoodBoardItemDeletedDetail = {
  projectId: string;
  boardId: string;
  itemId: string;
};

export type MoodBoardDeletedDetail = {
  projectId: string;
  boardId: string;
};

const bus = new EventTarget();

export function emitMoodBoardSaved(
  projectId: string,
  boardId: string,
  document: MoodBoardDocument,
) {
  bus.dispatchEvent(
    new CustomEvent<MoodBoardSavedDetail>("moodboard:saved", {
      detail: { projectId, boardId, document },
    }),
  );
}

export function emitMoodBoardItemDeleted(
  projectId: string,
  boardId: string,
  itemId: string,
) {
  bus.dispatchEvent(
    new CustomEvent<MoodBoardItemDeletedDetail>("moodboard:item-deleted", {
      detail: { projectId, boardId, itemId },
    }),
  );
}

export function emitMoodBoardDeleted(projectId: string, boardId: string) {
  bus.dispatchEvent(
    new CustomEvent<MoodBoardDeletedDetail>("moodboard:deleted", {
      detail: { projectId, boardId },
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

export function onMoodBoardDeleted(
  handler: (detail: MoodBoardDeletedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<MoodBoardDeletedDetail>).detail);
  };
  bus.addEventListener("moodboard:deleted", listener);
  return () => bus.removeEventListener("moodboard:deleted", listener);
}
