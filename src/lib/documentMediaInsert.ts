/**
 * Bridge between Mood Board and the active Document TipTap editor.
 *
 * Cursor policy: EditorShell keeps the Document editor mounted (hidden) when
 * other tabs are active so TipTap selection survives. Selection is keyed by
 * `projectId:docId` so inserts land in the active document. Insert restores
 * that selection; if never focused, content is appended at end.
 *
 * Inserts are live references (`moodBoardEmbed` by item id) — crop/border/
 * comment edits on the board propagate via moodBoardEvents.
 */

export type MoodBoardMediaInsert = {
  projectId: string;
  /** Mood Board item id — document embeds by reference, not a media snapshot. */
  moodBoardItemId: string;
  /** Display hint for status toast only. */
  filename?: string;
  kind?: string;
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
