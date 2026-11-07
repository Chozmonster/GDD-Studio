import { useCallback, useRef, useState } from "react";
import {
  createHistoryStack,
  historyCanRedo,
  historyCanUndo,
  historyPush,
  historyRedo,
  historyUndo,
  type HistoryStack,
} from "../lib/historyStack";

export type PushHistoryOptions = {
  /**
   * Coalesce rapid pushes (e.g. typing) into one undo step.
   * First call in a burst records the snapshot; later calls are skipped
   * until `coalesceMs` of idle time.
   */
  coalesce?: boolean;
  coalesceMs?: number;
};

const DEFAULT_LIMIT = 100;
const DEFAULT_COALESCE_MS = 600;

/**
 * Per-tab snapshot undo/redo. Call `push(preMutationSnapshot)` before
 * applying a meaningful change. `undo`/`redo` return the snapshot to restore
 * (or null when empty).
 */
export function useHistoryStack<T>(options?: { limit?: number }) {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const stackRef = useRef<HistoryStack<T>>(createHistoryStack());
  const coalescingRef = useRef(false);
  const coalesceTimer = useRef<number | null>(null);
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const clear = useCallback(() => {
    stackRef.current = createHistoryStack();
    coalescingRef.current = false;
    if (coalesceTimer.current) {
      window.clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
    bump();
  }, [bump]);

  const endCoalesce = useCallback(() => {
    coalescingRef.current = false;
    if (coalesceTimer.current) {
      window.clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
  }, []);

  const push = useCallback(
    (snapshot: T, opts?: PushHistoryOptions) => {
      if (opts?.coalesce) {
        const ms = opts.coalesceMs ?? DEFAULT_COALESCE_MS;
        if (!coalescingRef.current) {
          stackRef.current = historyPush(stackRef.current, snapshot, {
            limit,
          });
          coalescingRef.current = true;
          bump();
        }
        if (coalesceTimer.current) window.clearTimeout(coalesceTimer.current);
        coalesceTimer.current = window.setTimeout(() => {
          coalescingRef.current = false;
          coalesceTimer.current = null;
        }, ms);
        return;
      }
      endCoalesce();
      stackRef.current = historyPush(stackRef.current, snapshot, { limit });
      bump();
    },
    [bump, endCoalesce, limit],
  );

  const undo = useCallback(
    (current: T): T | null => {
      endCoalesce();
      const result = historyUndo(stackRef.current, current);
      if (!result) return null;
      stackRef.current = result.stack;
      bump();
      return result.snapshot;
    },
    [bump, endCoalesce],
  );

  const redo = useCallback(
    (current: T): T | null => {
      endCoalesce();
      const result = historyRedo(stackRef.current, current);
      if (!result) return null;
      stackRef.current = result.stack;
      bump();
      return result.snapshot;
    },
    [bump, endCoalesce],
  );

  // Primitive flags only — keep function refs stable for effect/callback deps.
  return {
    push,
    undo,
    redo,
    clear,
    canUndo: historyCanUndo(stackRef.current),
    canRedo: historyCanRedo(stackRef.current),
    /** Bumps when stack changes — useful as an effect dep. */
    version,
  } as const;
}
