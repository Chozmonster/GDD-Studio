import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FULL_CROP,
  clamp01,
  normalizeCrop,
} from "../../lib/moodBoardEdit";
import type { MoodBoardCrop } from "../../types";

type MoodCropDialogProps = {
  src: string;
  initial: MoodBoardCrop | null | undefined;
  onApply: (crop: MoodBoardCrop | null) => void;
  onCancel: () => void;
};

type DragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

function includesSide(mode: DragMode, side: string): boolean {
  return mode !== "move" && mode.includes(side);
}

/**
 * Simple interactive crop: drag the selection or its edge/corner handles.
 * Crop is stored as normalized fractions of the displayed image box.
 */
export function MoodCropDialog({
  src,
  initial,
  onApply,
  onCancel,
}: MoodCropDialogProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [crop, setCrop] = useState<MoodBoardCrop>(
    () => normalizeCrop(initial) ?? { ...FULL_CROP },
  );
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: MoodBoardCrop;
  } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onApply(normalizeCrop(crop));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crop, onApply, onCancel]);

  const beginDrag = useCallback(
    (mode: DragMode, e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...crop },
      };
    },
    [crop],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    const o = drag.origin;
    let next: MoodBoardCrop = { ...o };

    if (drag.mode === "move") {
      next.x = clamp01(o.x + dx);
      next.y = clamp01(o.y + dy);
      next.x = Math.min(next.x, 1 - o.width);
      next.y = Math.min(next.y, 1 - o.height);
      next.width = o.width;
      next.height = o.height;
    } else {
      let left = o.x;
      let top = o.y;
      let right = o.x + o.width;
      let bottom = o.y + o.height;
      if (includesSide(drag.mode, "w")) left = clamp01(o.x + dx);
      if (includesSide(drag.mode, "e")) right = clamp01(o.x + o.width + dx);
      if (includesSide(drag.mode, "n")) top = clamp01(o.y + dy);
      if (includesSide(drag.mode, "s")) bottom = clamp01(o.y + o.height + dy);
      if (right - left < 0.05) {
        if (includesSide(drag.mode, "w")) left = right - 0.05;
        else right = left + 0.05;
      }
      if (bottom - top < 0.05) {
        if (includesSide(drag.mode, "n")) top = bottom - 0.05;
        else bottom = top + 0.05;
      }
      left = clamp01(left);
      top = clamp01(top);
      right = Math.min(1, Math.max(left + 0.05, right));
      bottom = Math.min(1, Math.max(top + 0.05, bottom));
      next = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    }
    setCrop(normalizeCrop(next) ?? { ...FULL_CROP });
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="mood-edit-modal" role="dialog" aria-modal="true" aria-label="Crop image">
      <div className="mood-edit-dialog">
        <header className="mood-edit-header">
          <h3>Crop</h3>
          <p className="muted tiny">
            Drag the selection or its handles. Crop is saved on the Mood Board
            item and updates every live document embed.
          </p>
        </header>
        <div
          className="mood-crop-stage"
          ref={stageRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img src={src} alt="" draggable={false} className="mood-crop-source" />
          <div
            className="mood-crop-shade"
            style={{
              clipPath: `polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                ${crop.x * 100}% ${crop.y * 100}%,
                ${crop.x * 100}% ${(crop.y + crop.height) * 100}%,
                ${(crop.x + crop.width) * 100}% ${(crop.y + crop.height) * 100}%,
                ${(crop.x + crop.width) * 100}% ${crop.y * 100}%,
                ${crop.x * 100}% ${crop.y * 100}%
              )`,
            }}
          />
          <div
            className="mood-crop-rect"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
            }}
            onPointerDown={(e) => beginDrag("move", e)}
          >
            {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map(
              (h) => (
                <span
                  key={h}
                  className={`mood-crop-handle mood-crop-handle-${h}`}
                  onPointerDown={(e) => beginDrag(h, e)}
                />
              ),
            )}
          </div>
        </div>
        <footer className="mood-edit-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setCrop({ ...FULL_CROP })}
          >
            Reset
          </button>
          <div className="mood-edit-actions-right">
            <button type="button" className="ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(normalizeCrop(crop))}
            >
              Apply crop
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
