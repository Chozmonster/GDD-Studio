/** Canvas grid step — keep in sync with `<Background gap={GRID_SIZE} />`. */
export const GRID_SIZE = 20;

/** Magnetic alignment distance (flow units / px at zoom 1). */
export const ALIGN_THRESHOLD = 10;

export type SnapGuide = {
  orientation: "v" | "h";
  /** Flow-coordinate of the guide line (x for vertical, y for horizontal). */
  value: number;
};

export type SnapBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function snapToGrid(n: number, grid: number = GRID_SIZE): number {
  return Math.round(n / grid) * grid;
}

export function snapSize(
  width: number,
  height: number,
  grid: number = GRID_SIZE,
  minWidth = 80,
  minHeight = 44,
): { width: number; height: number } {
  return {
    width: Math.max(minWidth, snapToGrid(width, grid)),
    height: Math.max(minHeight, snapToGrid(height, grid)),
  };
}

type AxisHit = { position: number; guide: number; dist: number };

function pickClosest(hits: AxisHit[], threshold: number): AxisHit | null {
  let best: AxisHit | null = null;
  for (const h of hits) {
    if (h.dist > threshold) continue;
    if (!best || h.dist < best.dist) best = h;
  }
  return best;
}

/**
 * Snap a dragged node: magnetic align to other nodes' edges/centers when
 * close (so N/S or E/W handles line up), otherwise fall back to the grid.
 */
export function snapDragPosition(
  raw: { x: number; y: number },
  size: { width: number; height: number },
  others: SnapBox[],
  threshold: number = ALIGN_THRESHOLD,
  grid: number = GRID_SIZE,
): { x: number; y: number; guides: SnapGuide[] } {
  const w = size.width;
  const h = size.height;
  const xHits: AxisHit[] = [];
  const yHits: AxisHit[] = [];

  const moving = {
    left: raw.x,
    right: raw.x + w,
    cx: raw.x + w / 2,
    top: raw.y,
    bottom: raw.y + h,
    cy: raw.y + h / 2,
  };

  for (const o of others) {
    const left = o.x;
    const right = o.x + o.width;
    const cx = o.x + o.width / 2;
    const top = o.y;
    const bottom = o.y + o.height;
    const cy = o.y + o.height / 2;

    // X: centers (handle N/S column), edges, and edge-to-edge
    const xTargets: Array<{ guide: number; nextX: number }> = [
      { guide: cx, nextX: cx - w / 2 },
      { guide: left, nextX: left },
      { guide: right, nextX: right - w },
      { guide: left, nextX: left - w },
      { guide: right, nextX: right },
      { guide: cx, nextX: cx },
      { guide: cx, nextX: cx - w },
    ];
    for (const t of xTargets) {
      xHits.push({
        position: t.nextX,
        guide: t.guide,
        dist: Math.abs(t.nextX - raw.x),
      });
    }

    // Y: centers (handle E/W row), edges
    const yTargets: Array<{ guide: number; nextY: number }> = [
      { guide: cy, nextY: cy - h / 2 },
      { guide: top, nextY: top },
      { guide: bottom, nextY: bottom - h },
      { guide: top, nextY: top - h },
      { guide: bottom, nextY: bottom },
      { guide: cy, nextY: cy },
      { guide: cy, nextY: cy - h },
    ];
    for (const t of yTargets) {
      yHits.push({
        position: t.nextY,
        guide: t.guide,
        dist: Math.abs(t.nextY - raw.y),
      });
    }

    // Silence unused moving edges — kept for clarity / future edge-to-edge
    void moving;
  }

  const xHit = pickClosest(xHits, threshold);
  const yHit = pickClosest(yHits, threshold);
  const guides: SnapGuide[] = [];

  let x = raw.x;
  let y = raw.y;

  if (xHit) {
    x = xHit.position;
    guides.push({ orientation: "v", value: xHit.guide });
  } else {
    x = snapToGrid(raw.x, grid);
  }

  if (yHit) {
    y = yHit.position;
    guides.push({ orientation: "h", value: yHit.guide });
  } else {
    y = snapToGrid(raw.y, grid);
  }

  return { x, y, guides };
}

export function nodeBox(node: {
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
  style?: { width?: number | string; height?: number | string };
}): SnapBox {
  const width = Number(node.style?.width ?? node.width ?? 160);
  const height = Number(node.style?.height ?? node.height ?? 64);
  return {
    x: node.position.x,
    y: node.position.y,
    width: Number.isFinite(width) ? width : 160,
    height: Number.isFinite(height) ? height : 64,
  };
}
