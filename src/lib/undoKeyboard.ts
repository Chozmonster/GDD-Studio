/**
 * True when the event is Undo (Mod+Z, no Shift) or Redo (Mod+Shift+Z or Mod+Y).
 * Returns null for unrelated keys.
 */
export function undoRedoFromKeyboard(
  event: KeyboardEvent,
): "undo" | "redo" | null {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod) return null;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey && !event.altKey) return "undo";
  if (key === "z" && event.shiftKey) return "redo";
  if (key === "y" && !event.shiftKey && !event.altKey) return "redo";
  return null;
}

/** Skip when the event target is an editable field that should keep native undo
 * — except when the tab owns form-level history (RGD), callers pass force=true. */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
