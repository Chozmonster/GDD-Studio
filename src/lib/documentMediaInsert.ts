/**
 * Bridge between Mood Board and the Document TipTap editor.
 *
 * Cursor policy: EditorShell keeps the Document editor mounted (hidden) when
 * other tabs are active so TipTap selection survives. We also snapshot
 * from/to on selectionUpdate/blur as a fallback. Insert restores that
 * selection; if the document was never focused, content is appended at end.
 */

export type MoodBoardMediaInsert = {
  projectId: string;
  assetId: string;
  kind: string;
  filename: string;
  mime: string;
};

type DocSelection = { from: number; to: number };

const bus = new EventTarget();
const lastSelection = new Map<string, DocSelection>();

export function rememberDocSelection(
  projectId: string,
  from: number,
  to: number,
): void {
  lastSelection.set(projectId, { from, to });
}

export function getDocSelection(projectId: string): DocSelection | null {
  return lastSelection.get(projectId) ?? null;
}

export function clearDocSelection(projectId: string): void {
  lastSelection.delete(projectId);
}

export function requestInsertMediaFromMoodBoard(
  detail: MoodBoardMediaInsert,
): void {
  bus.dispatchEvent(
    new CustomEvent<MoodBoardMediaInsert>("moodboard:insert-media", {
      detail,
    }),
  );
}

export function onInsertMediaFromMoodBoard(
  handler: (detail: MoodBoardMediaInsert) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<MoodBoardMediaInsert>).detail);
  };
  bus.addEventListener("moodboard:insert-media", listener);
  return () => bus.removeEventListener("moodboard:insert-media", listener);
}
