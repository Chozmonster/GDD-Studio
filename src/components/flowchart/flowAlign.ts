import { GRID_SIZE, nodeBox, type SnapBox } from "./nodeSnap";

export type AlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type DistributeAxis = "horizontal" | "vertical";

type Positioned = {
  id: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  style?: { width?: number | string; height?: number | string };
};

function snap(n: number, grid: number = GRID_SIZE): number {
  return Math.round(n / grid) * grid;
}

/**
 * Align selected nodes to a shared edge or center line.
 * Edge aligns use the extreme of the selection (no re-snap of that edge) so the
 * reference node stays put; center/middle results snap to the grid.
 */
export function alignNodePositions(
  nodes: Positioned[],
  mode: AlignMode,
  grid: number = GRID_SIZE,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length < 2) return result;

  const boxes = nodes.map((n) => ({ id: n.id, box: nodeBox(n) }));

  let anchor: number;
  switch (mode) {
    case "left":
      anchor = Math.min(...boxes.map((b) => b.box.x));
      for (const { id, box } of boxes) {
        result.set(id, { x: anchor, y: box.y });
      }
      break;
    case "center": {
      const minL = Math.min(...boxes.map((b) => b.box.x));
      const maxR = Math.max(...boxes.map((b) => b.box.x + b.box.width));
      anchor = (minL + maxR) / 2;
      for (const { id, box } of boxes) {
        result.set(id, {
          x: snap(anchor - box.width / 2, grid),
          y: box.y,
        });
      }
      break;
    }
    case "right":
      anchor = Math.max(...boxes.map((b) => b.box.x + b.box.width));
      for (const { id, box } of boxes) {
        result.set(id, { x: anchor - box.width, y: box.y });
      }
      break;
    case "top":
      anchor = Math.min(...boxes.map((b) => b.box.y));
      for (const { id, box } of boxes) {
        result.set(id, { x: box.x, y: anchor });
      }
      break;
    case "middle": {
      const minT = Math.min(...boxes.map((b) => b.box.y));
      const maxB = Math.max(...boxes.map((b) => b.box.y + b.box.height));
      anchor = (minT + maxB) / 2;
      for (const { id, box } of boxes) {
        result.set(id, {
          x: box.x,
          y: snap(anchor - box.height / 2, grid),
        });
      }
      break;
    }
    case "bottom":
      anchor = Math.max(...boxes.map((b) => b.box.y + b.box.height));
      for (const { id, box } of boxes) {
        result.set(id, { x: box.x, y: anchor - box.height });
      }
      break;
  }

  return result;
}

/**
 * Distribute selected nodes with equal gaps along an axis.
 * End nodes stay put; interiors are spaced evenly (snapped). Needs ≥ 3 nodes.
 */
export function distributeNodePositions(
  nodes: Positioned[],
  axis: DistributeAxis,
  grid: number = GRID_SIZE,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length < 3) return result;

  const boxes: Array<{ id: string; box: SnapBox }> = nodes.map((n) => ({
    id: n.id,
    box: nodeBox(n),
  }));

  if (axis === "horizontal") {
    boxes.sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const totalWidth = boxes.reduce((sum, b) => sum + b.box.width, 0);
    const span = last.x + last.width - first.x;
    const gap = (span - totalWidth) / (boxes.length - 1);
    let cursor = first.x;
    for (let i = 0; i < boxes.length; i++) {
      const { id, box } = boxes[i];
      const x = i === 0 || i === boxes.length - 1 ? box.x : snap(cursor, grid);
      result.set(id, { x, y: box.y });
      cursor = (i === 0 ? box.x : x) + box.width + gap;
    }
  } else {
    boxes.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const totalHeight = boxes.reduce((sum, b) => sum + b.box.height, 0);
    const span = last.y + last.height - first.y;
    const gap = (span - totalHeight) / (boxes.length - 1);
    let cursor = first.y;
    for (let i = 0; i < boxes.length; i++) {
      const { id, box } = boxes[i];
      const y = i === 0 || i === boxes.length - 1 ? box.y : snap(cursor, grid);
      result.set(id, { x: box.x, y });
      cursor = (i === 0 ? box.y : y) + box.height + gap;
    }
  }

  return result;
}
