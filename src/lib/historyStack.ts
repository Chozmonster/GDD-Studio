/** Snapshot undo/redo stack (no deps). Clone snapshots before push/restore. */

export type HistoryStackOptions = {
  /** Max past entries (default 100). */
  limit?: number;
};

export type HistoryStack<T> = {
  past: T[];
  future: T[];
};

export function createHistoryStack<T>(): HistoryStack<T> {
  return { past: [], future: [] };
}

export function historyCanUndo<T>(stack: HistoryStack<T>): boolean {
  return stack.past.length > 0;
}

export function historyCanRedo<T>(stack: HistoryStack<T>): boolean {
  return stack.future.length > 0;
}

/**
 * Record a pre-mutation snapshot. Clears the redo branch (standard).
 * Caller must pass a deep-cloned (or otherwise immutable) snapshot.
 */
export function historyPush<T>(
  stack: HistoryStack<T>,
  snapshot: T,
  options: HistoryStackOptions = {},
): HistoryStack<T> {
  const limit = options.limit ?? 100;
  const past = [...stack.past, snapshot];
  while (past.length > limit) past.shift();
  return { past, future: [] };
}

/** Pop past → return previous snapshot; current goes onto future. */
export function historyUndo<T>(
  stack: HistoryStack<T>,
  current: T,
): { stack: HistoryStack<T>; snapshot: T } | null {
  if (stack.past.length === 0) return null;
  const past = stack.past.slice();
  const snapshot = past.pop()!;
  return {
    stack: { past, future: [...stack.future, current] },
    snapshot,
  };
}

/** Pop future → return next snapshot; current goes onto past. */
export function historyRedo<T>(
  stack: HistoryStack<T>,
  current: T,
): { stack: HistoryStack<T>; snapshot: T } | null {
  if (stack.future.length === 0) return null;
  const future = stack.future.slice();
  const snapshot = future.pop()!;
  return {
    stack: { past: [...stack.past, current], future },
    snapshot,
  };
}
