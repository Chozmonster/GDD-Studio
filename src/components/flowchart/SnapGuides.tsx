import { ViewportPortal } from "@xyflow/react";
import type { SnapGuide } from "./nodeSnap";

type SnapGuidesProps = {
  guides: SnapGuide[];
  /** Rough extent so lines span the visible graph. */
  span?: number;
};

/** Magnetic alignment guides in flow coordinates while dragging. */
export function SnapGuides({ guides, span = 4000 }: SnapGuidesProps) {
  if (guides.length === 0) return null;
  const half = span / 2;
  return (
    <ViewportPortal>
      <svg
        className="snap-guides"
        width={span}
        height={span}
        style={{
          position: "absolute",
          top: -half,
          left: -half,
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        {guides.map((g, i) =>
          g.orientation === "v" ? (
            <line
              key={`v-${g.value}-${i}`}
              x1={g.value + half}
              y1={0}
              x2={g.value + half}
              y2={span}
              className="snap-guide-line"
            />
          ) : (
            <line
              key={`h-${g.value}-${i}`}
              x1={0}
              y1={g.value + half}
              x2={span}
              y2={g.value + half}
              className="snap-guide-line"
            />
          ),
        )}
      </svg>
    </ViewportPortal>
  );
}
