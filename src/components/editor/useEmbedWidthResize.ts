/**
 * Shared pointer-driven width resize for live document embeds
 * (media, Mood Board, RGD table, Graph, flowchart). Live width is held in
 * React state during the drag; attrs are written once on pointer-up so TipTap
 * history stays tidy.
 */
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type EmbedAlign = "left" | "center" | "right" | "justify";

export function normalizeEmbedAlign(raw: unknown): EmbedAlign {
  const v = String(raw ?? "left");
  if (v === "center" || v === "right" || v === "justify") return v;
  return "left";
}

export function embedAlignClass(align: EmbedAlign): string {
  switch (align) {
    case "center":
      return "is-align-center";
    case "right":
      return "is-align-right";
    case "justify":
      return "is-align-justify";
    default:
      return "is-align-left";
  }
}

/** Which edge handles to show so drag direction matches text alignment. */
export function embedResizeHandles(align: EmbedAlign): {
  showWest: boolean;
  showEast: boolean;
} {
  return {
    showWest: align === "right" || align === "center",
    showEast: align !== "right",
  };
}

type Bounds = {
  min: number;
  max: number;
  defaultWidth: number;
};

function clampWidth(n: number, min: number, maxCap: number, absoluteMax: number): number {
  return Math.min(Math.max(min, Math.round(n)), Math.min(absoluteMax, maxCap));
}

type UseEmbedWidthResizeArgs = {
  storedWidth: number;
  bounds: Bounds;
  updateWidth: (width: number) => void;
};

export function useEmbedWidthResize({
  storedWidth,
  bounds,
  updateWidth,
}: UseEmbedWidthResizeArgs) {
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const liveWidthRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    edge: "e" | "w";
    maxCap: number;
  } | null>(null);

  const width = liveWidth ?? storedWidth;

  const endResize = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const finalWidth = liveWidthRef.current ?? storedWidth;
      liveWidthRef.current = null;
      setLiveWidth(null);
      if (finalWidth !== storedWidth) {
        updateWidth(finalWidth);
      }
    },
    [storedWidth, updateWidth],
  );

  const onResizeMove = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta =
        drag.edge === "e" ? e.clientX - drag.startX : drag.startX - e.clientX;
      const next = clampWidth(
        drag.startWidth + delta,
        bounds.min,
        drag.maxCap,
        bounds.max,
      );
      liveWidthRef.current = next;
      setLiveWidth(next);
    },
    [bounds.max, bounds.min],
  );

  const beginResize = useCallback(
    (edge: "e" | "w") => (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const host =
        (e.currentTarget.closest(".editor-canvas") as HTMLElement | null) ??
        (e.currentTarget.parentElement?.parentElement as HTMLElement | null);
      const maxCap = Math.max(bounds.min, host?.clientWidth ?? bounds.max);
      dragRef.current = {
        startX: e.clientX,
        startWidth: width,
        edge,
        maxCap,
      };
      liveWidthRef.current = width;
      setLiveWidth(width);
    },
    [bounds.max, bounds.min, width],
  );

  return {
    width,
    beginResize,
    onResizeMove,
    endResize,
  };
}
