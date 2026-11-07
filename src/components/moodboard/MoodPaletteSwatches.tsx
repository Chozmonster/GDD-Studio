import type { CSSProperties } from "react";
import { borderCss } from "../../lib/moodBoardEdit";
import type { MoodBoardBorder } from "../../types";

type MoodPaletteSwatchesProps = {
  hexes: string[];
  border?: MoodBoardBorder | null;
  /** When set, each swatch is a button that copies its hex. */
  onCopy?: (hex: string) => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * Full-width labelled colour blocks for palette tiles / embeds.
 * Avoids the default 4:3 cover crop that clips generated palette PNGs.
 */
export function MoodPaletteSwatches({
  hexes,
  border,
  onCopy,
  className,
  style,
}: MoodPaletteSwatchesProps) {
  const rootClass = ["mood-palette-board", className].filter(Boolean).join(" ");
  const borderStyle = borderCss(border);
  const interactive = typeof onCopy === "function";

  return (
    <div
      className={rootClass}
      style={{ ...borderStyle, ...style }}
      role="list"
      aria-label="Palette colours"
    >
      {hexes.map((hex) => {
        const label = (
          <span className="mood-palette-board-hex">{hex}</span>
        );
        if (interactive) {
          return (
            <button
              key={hex}
              type="button"
              role="listitem"
              className="mood-palette-board-swatch"
              style={{ background: hex }}
              title={`Copy ${hex}`}
              onClick={(e) => {
                e.stopPropagation();
                onCopy(hex);
              }}
            >
              {label}
            </button>
          );
        }
        return (
          <div
            key={hex}
            role="listitem"
            className="mood-palette-board-swatch is-static"
            style={{ background: hex }}
            title={hex}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
