import { Redo2, Undo2 } from "lucide-react";
import { ToolbarIconButton } from "./ToolbarIconButton";

type UndoRedoButtonsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Extra class on the wrapping group. */
  className?: string;
  /** Use plain buttons (flowchart / mood / RGD toolbars) instead of icon chrome. */
  variant?: "icon" | "text";
};

/**
 * Shared Undo / Redo chrome. Labels include the common shortcut hint.
 * Callers wire keyboard shortcuts when their tab is focused.
 */
export function UndoRedoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
  variant = "icon",
}: UndoRedoButtonsProps) {
  const groupClass = ["undo-redo-group", className].filter(Boolean).join(" ");

  if (variant === "text") {
    return (
      <div className={groupClass} role="group" aria-label="Undo and redo">
        <button
          type="button"
          className="ghost"
          disabled={!canUndo}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
          onClick={onUndo}
        >
          Undo
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!canRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo"
          onClick={onRedo}
        >
          Redo
        </button>
      </div>
    );
  }

  return (
    <div className={groupClass} role="group" aria-label="Undo and redo">
      <ToolbarIconButton
        label="Undo (Ctrl/Cmd+Z)"
        icon={Undo2}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <ToolbarIconButton
        label="Redo (Ctrl/Cmd+Shift+Z)"
        icon={Redo2}
        disabled={!canRedo}
        onClick={onRedo}
      />
    </div>
  );
}
