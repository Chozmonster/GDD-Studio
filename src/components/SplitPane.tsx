import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { readSplitSize, writeSplitSize } from "../lib/splitSizes";

export type SplitOrientation = "horizontal" | "vertical";

export type SplitPaneProps = {
  /** Persistence key — sizes stored under `gdd-studio:split:{id}`. */
  id: string;
  orientation?: SplitOrientation;
  /**
   * Which pane the size applies to.
   * `start` = first child (left/top), `end` = second child (right/bottom).
   */
  primary?: "start" | "end";
  /** Default primary pane size in CSS pixels. */
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  /** Minimum size of the flex (non-primary) pane. */
  minSecondary?: number;
  /**
   * When the container’s main-axis size drops below this, panes stack and
   * dragging is disabled so narrow / mobile-ish windows stay usable.
   */
  stackBelow?: number;
  className?: string;
  children: [ReactNode, ReactNode];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Two-pane resizable split with localStorage persistence.
 * Nest for three+ pane layouts (e.g. document left | editor | right).
 */
export function SplitPane({
  id,
  orientation = "horizontal",
  primary = "start",
  defaultSize,
  minSize = 120,
  maxSize = 640,
  minSecondary = 200,
  stackBelow = 720,
  className,
  children,
}: SplitPaneProps) {
  const [a, b] = children;
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() =>
    clamp(readSplitSize(id, defaultSize), minSize, maxSize),
  );
  const [stacked, setStacked] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    startPos: number;
    startSize: number;
  } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const main =
        orientation === "horizontal"
          ? entry.contentRect.width
          : entry.contentRect.height;
      setStacked(main < stackBelow);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation, stackBelow]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (stacked) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      dragRef.current = {
        startPos: orientation === "horizontal" ? e.clientX : e.clientY,
        startSize: size,
      };
      setDragging(true);
    },
    [orientation, size, stacked],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const root = rootRef.current;
      if (!drag || !root) return;
      const pos = orientation === "horizontal" ? e.clientX : e.clientY;
      const delta = pos - drag.startPos;
      const main =
        orientation === "horizontal" ? root.clientWidth : root.clientHeight;
      const maxPrimary = Math.min(
        maxSize,
        Math.max(minSize, main - minSecondary),
      );
      const next =
        primary === "start"
          ? drag.startSize + delta
          : drag.startSize - delta;
      setSize(clamp(next, minSize, maxPrimary));
    },
    [maxSize, minSecondary, minSize, orientation, primary],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      setSize((current) => {
        writeSplitSize(id, current);
        return current;
      });
    },
    [id],
  );

  const isHorizontal = orientation === "horizontal";
  const primaryStyle: CSSProperties = stacked
    ? isHorizontal
      ? { width: "100%", minWidth: 0, maxHeight: "40%", overflow: "auto" }
      : { height: "auto", maxHeight: "45%", minHeight: 0, overflow: "auto" }
    : isHorizontal
      ? {
          flex: `0 0 ${size}px`,
          width: size,
          minWidth: minSize,
          maxWidth: maxSize,
        }
      : {
          flex: `0 0 ${size}px`,
          height: size,
          minHeight: minSize,
          maxHeight: maxSize,
        };

  const secondaryStyle: CSSProperties = {
    flex: "1 1 0",
    minWidth: isHorizontal && !stacked ? 0 : undefined,
    minHeight: !isHorizontal || stacked ? 0 : undefined,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const startPane = (
    <div
      className="split-pane-region"
      data-split-role={primary === "start" ? "primary" : "secondary"}
      style={primary === "start" ? primaryStyle : secondaryStyle}
    >
      {a}
    </div>
  );
  const endPane = (
    <div
      className="split-pane-region"
      data-split-role={primary === "end" ? "primary" : "secondary"}
      style={primary === "end" ? primaryStyle : secondaryStyle}
    >
      {b}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={[
        "split-pane",
        isHorizontal ? "split-pane-h" : "split-pane-v",
        stacked ? "is-stacked" : "",
        dragging ? "is-dragging" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-split-id={id}
    >
      {startPane}
      <div
        className="split-pane-gutter"
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-label="Resize panes"
        aria-valuenow={Math.round(size)}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        tabIndex={stacked ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          if (stacked) return;
          const step = e.shiftKey ? 24 : 12;
          let delta = 0;
          if (isHorizontal) {
            if (e.key === "ArrowLeft") delta = primary === "start" ? -step : step;
            if (e.key === "ArrowRight") delta = primary === "start" ? step : -step;
          } else {
            if (e.key === "ArrowUp") delta = primary === "start" ? -step : step;
            if (e.key === "ArrowDown") delta = primary === "start" ? step : -step;
          }
          if (!delta) return;
          e.preventDefault();
          setSize((current) => {
            const root = rootRef.current;
            const main = root
              ? isHorizontal
                ? root.clientWidth
                : root.clientHeight
              : maxSize + minSecondary;
            const maxPrimary = Math.min(
              maxSize,
              Math.max(minSize, main - minSecondary),
            );
            const next = clamp(current + delta, minSize, maxPrimary);
            writeSplitSize(id, next);
            return next;
          });
        }}
      />
      {endPane}
    </div>
  );
}
