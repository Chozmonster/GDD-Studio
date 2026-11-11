import { GRID_SIZE, type SnapBox } from "./nodeSnap";

/** Explicit N/E/S/W anchor ids stored on edges as sourceHandle/targetHandle. */
export const FLOW_ANCHOR_IDS = ["top", "right", "bottom", "left"] as const;
export type FlowAnchorId = (typeof FLOW_ANCHOR_IDS)[number];

const QUICK_ADD_GAP = 80;

export function isFlowAnchorId(value: unknown): value is FlowAnchorId {
  return (
    typeof value === "string" &&
    (FLOW_ANCHOR_IDS as readonly string[]).includes(value)
  );
}

/** Handle on the new node that should receive the connector from the source. */
export function oppositeAnchor(anchor: FlowAnchorId): FlowAnchorId {
  switch (anchor) {
    case "top":
      return "bottom";
    case "right":
      return "left";
    case "bottom":
      return "top";
    case "left":
      return "right";
  }
}

/**
 * Place a new sibling node off the given handle, snapped to the grid.
 * Centers the new node against the source on the perpendicular axis.
 */
export function quickAddPosition(
  source: SnapBox,
  anchor: FlowAnchorId,
  size: { width: number; height: number },
  gap: number = QUICK_ADD_GAP,
  grid: number = GRID_SIZE,
): { x: number; y: number } {
  const snap = (n: number) => Math.round(n / grid) * grid;
  const midX = source.x + source.width / 2 - size.width / 2;
  const midY = source.y + source.height / 2 - size.height / 2;

  switch (anchor) {
    case "top":
      return {
        x: snap(midX),
        y: snap(source.y - gap - size.height),
      };
    case "right":
      return {
        x: snap(source.x + source.width + gap),
        y: snap(midY),
      };
    case "bottom":
      return {
        x: snap(midX),
        y: snap(source.y + source.height + gap),
      };
    case "left":
      return {
        x: snap(source.x - gap - size.width),
        y: snap(midY),
      };
  }
}

export { QUICK_ADD_GAP };
