import { useEffect, useState } from "react";
import {
  normalizeBorder,
  sanitizeBorderColor,
} from "../../lib/moodBoardEdit";
import type { MoodBoardBorder } from "../../types";

type MoodBorderDialogProps = {
  initial: MoodBoardBorder | null | undefined;
  onApply: (border: MoodBoardBorder | null) => void;
  onCancel: () => void;
};

export function MoodBorderDialog({
  initial,
  onApply,
  onCancel,
}: MoodBorderDialogProps) {
  const seed = normalizeBorder(initial);
  const [width, setWidth] = useState(seed?.width ?? 2);
  const [color, setColor] = useState(seed?.color ?? "#e8e8e8");
  const [radius, setRadius] = useState(seed?.radius ?? 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const preview: MoodBoardBorder = {
    width,
    color: sanitizeBorderColor(color),
    radius,
  };

  return (
    <div
      className="mood-edit-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Border"
    >
      <div className="mood-edit-dialog mood-border-dialog">
        <header className="mood-edit-header">
          <h3>Border</h3>
          <p className="muted tiny">
            Width, color, and optional radius — saved on the Mood Board item and
            mirrored in every live document embed.
          </p>
        </header>
        <div className="mood-border-fields">
          <label>
            Width (px)
            <input
              type="number"
              min={0}
              max={64}
              value={width}
              onChange={(e) =>
                setWidth(Math.min(64, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </label>
          <label>
            Color
            <span className="mood-border-color-row">
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(sanitizeBorderColor(color))
                    ? sanitizeBorderColor(color)
                    : "#e8e8e8"
                }
                onChange={(e) => setColor(e.target.value)}
                aria-label="Border color picker"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                spellCheck={false}
              />
            </span>
          </label>
          <label>
            Radius (px)
            <input
              type="number"
              min={0}
              max={64}
              value={radius}
              onChange={(e) =>
                setRadius(
                  Math.min(64, Math.max(0, Number(e.target.value) || 0)),
                )
              }
            />
          </label>
        </div>
        <div
          className="mood-border-preview"
          style={{
            border:
              preview.width > 0
                ? `${preview.width}px solid ${sanitizeBorderColor(preview.color)}`
                : "1px dashed var(--line)",
            borderRadius: preview.radius ?? 0,
          }}
        >
          Preview
        </div>
        <footer className="mood-edit-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setWidth(0);
              setRadius(0);
              setColor("#e8e8e8");
            }}
          >
            Clear
          </button>
          <div className="mood-edit-actions-right">
            <button type="button" className="ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onApply(
                  normalizeBorder({
                    width,
                    color,
                    radius,
                  }),
                )
              }
            >
              Apply border
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
