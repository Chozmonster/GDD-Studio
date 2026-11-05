import { Position } from "@xyflow/react";

export const STUB_LEN = 24;

export type Pt = { x: number; y: number };

export function sideFromHandle(
  handle?: string | null,
  fallback: Position = Position.Right,
): Position {
  switch (handle) {
    case "top":
      return Position.Top;
    case "right":
      return Position.Right;
    case "bottom":
      return Position.Bottom;
    case "left":
      return Position.Left;
    default:
      return fallback;
  }
}

/** Outward along the handle normal (away from the node). */
function outward(x: number, y: number, side: Position, len: number): Pt {
  switch (side) {
    case Position.Top:
      return { x, y: y - len };
    case Position.Bottom:
      return { x, y: y + len };
    case Position.Left:
      return { x: x - len, y };
    case Position.Right:
    default:
      return { x: x + len, y };
  }
}

function almostEq(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) < eps;
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || !almostEq(prev.x, p.x) || !almostEq(prev.y, p.y)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Orthogonal waypoints strictly between the two stub tips (exclusive).
 * Never touches the node handles — stubs are added by the caller.
 */
function middleOrthogonal(
  a: Pt,
  b: Pt,
  sourceSide: Position,
  targetSide: Position,
): Pt[] {
  const sourceH =
    sourceSide === Position.Left || sourceSide === Position.Right;
  const targetH =
    targetSide === Position.Left || targetSide === Position.Right;

  // Already aligned on an axis — single segment (may still need a U-bend
  // if stubs face away from each other).
  if (almostEq(a.x, b.x) || almostEq(a.y, b.y)) {
    if (almostEq(a.x, b.x) && sourceH === targetH && sourceH === false) {
      // both vertical stubs, same column — fine
      return [];
    }
    if (almostEq(a.y, b.y) && sourceH === targetH && sourceH === true) {
      return [];
    }
  }

  if (sourceH && targetH) {
    // E/W → E/W: vertical bridge at midpoint x
    const midX = (a.x + b.x) / 2;
    return [
      { x: midX, y: a.y },
      { x: midX, y: b.y },
    ];
  }

  if (!sourceH && !targetH) {
    // N/S → N/S: horizontal bridge at midpoint y
    const midY = (a.y + b.y) / 2;
    return [
      { x: a.x, y: midY },
      { x: b.x, y: midY },
    ];
  }

  // Mixed orientation — one elbow
  if (sourceH) {
    // leave horizontally, then vertical into target stub column
    return [{ x: b.x, y: a.y }];
  }
  // leave vertically, then horizontal into target stub row
  return [{ x: a.x, y: b.y }];
}

/**
 * Full orthogonal route with mandatory perpendicular stubs:
 * handle → ≥STUB outward → orthog bends → ≥STUB outward → handle.
 */
function buildOrthogonalStubPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceSide: Position,
  targetSide: Position,
  stubLen: number = STUB_LEN,
): Pt[] {
  const source: Pt = { x: sourceX, y: sourceY };
  const target: Pt = { x: targetX, y: targetY };
  const sStub = outward(sourceX, sourceY, sourceSide, stubLen);
  const tStub = outward(targetX, targetY, targetSide, stubLen);
  const mid = middleOrthogonal(sStub, tStub, sourceSide, targetSide);
  return dedupe([source, sStub, ...mid, tStub, target]);
}

function pointsToSvgPath(points: Pt[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((p) => `L ${p.x} ${p.y}`),
  ].join(" ");
}

/**
 * Curved body between stub tips, but control points continue along the
 * handle normals so the path never leaves the stub at a diagonal.
 */
export function buildCurvedStubPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceSide: Position,
  targetSide: Position,
  stubLen: number = STUB_LEN,
): { path: string; points: Pt[]; labelX: number; labelY: number } {
  const source: Pt = { x: sourceX, y: sourceY };
  const target: Pt = { x: targetX, y: targetY };
  const sStub = outward(sourceX, sourceY, sourceSide, stubLen);
  const tStub = outward(targetX, targetY, targetSide, stubLen);
  // Continue along the same normal so the cubic's initial tangent is perpendicular.
  const c1 = outward(sStub.x, sStub.y, sourceSide, stubLen * 1.25);
  const c2 = outward(tStub.x, tStub.y, targetSide, stubLen * 1.25);

  const path = [
    `M ${source.x} ${source.y}`,
    `L ${sStub.x} ${sStub.y}`,
    `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${tStub.x} ${tStub.y}`,
    `L ${target.x} ${target.y}`,
  ].join(" ");

  return {
    path,
    points: [source, sStub, c1, c2, tStub, target],
    labelX: (sStub.x + tStub.x) / 2,
    labelY: (sStub.y + tStub.y) / 2,
  };
}

export function buildAngledStubPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceSide: Position,
  targetSide: Position,
  stubLen: number = STUB_LEN,
): { path: string; points: Pt[]; labelX: number; labelY: number } {
  const points = buildOrthogonalStubPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceSide,
    targetSide,
    stubLen,
  );
  const mid = points[Math.floor(points.length / 2)] ?? points[0];
  return {
    path: pointsToSvgPath(points),
    points,
    labelX: mid.x,
    labelY: mid.y,
  };
}

/** Assert first/last segments are axis-aligned stubs of at least stubLen. */
export function assertStubGeometry(
  points: Pt[],
  sourceSide: Position,
  targetSide: Position,
  stubLen: number = STUB_LEN,
): string[] {
  const errors: string[] = [];
  if (points.length < 3) {
    errors.push("path too short");
    return errors;
  }
  const a = points[0];
  const b = points[1];
  const c = points[points.length - 2];
  const d = points[points.length - 1];

  const dx0 = b.x - a.x;
  const dy0 = b.y - a.y;
  const dx1 = d.x - c.x;
  const dy1 = d.y - c.y;

  if (Math.hypot(dx0, dy0) < stubLen - 1) {
    errors.push(`source stub too short: ${Math.hypot(dx0, dy0).toFixed(1)}`);
  }
  if (Math.hypot(c.x - d.x, c.y - d.y) < stubLen - 1) {
    errors.push(
      `target stub too short: ${Math.hypot(c.x - d.x, c.y - d.y).toFixed(1)}`,
    );
  }
  // Source stub: leave the handle along its outward normal.
  if (sourceSide === Position.Top || sourceSide === Position.Bottom) {
    if (Math.abs(dx0) > 0.5) errors.push("source stub not vertical");
    if (sourceSide === Position.Top && dy0 >= 0) {
      errors.push("source north stub must go up");
    }
    if (sourceSide === Position.Bottom && dy0 <= 0) {
      errors.push("source south stub must go down");
    }
  } else {
    if (Math.abs(dy0) > 0.5) errors.push("source stub not horizontal");
    if (sourceSide === Position.Left && dx0 >= 0) {
      errors.push("source west stub must go left");
    }
    if (sourceSide === Position.Right && dx0 <= 0) {
      errors.push("source east stub must go right");
    }
  }
  // Target approach: last segment into the handle is opposite of outward.
  if (targetSide === Position.Top || targetSide === Position.Bottom) {
    if (Math.abs(dx1) > 0.5) errors.push("target stub not vertical");
    if (targetSide === Position.Top && dy1 <= 0) {
      errors.push("target north approach must go down into handle");
    }
    if (targetSide === Position.Bottom && dy1 >= 0) {
      errors.push("target south approach must go up into handle");
    }
  } else {
    if (Math.abs(dy1) > 0.5) errors.push("target stub not horizontal");
    if (targetSide === Position.Left && dx1 <= 0) {
      errors.push("target west approach must go right into handle");
    }
    if (targetSide === Position.Right && dx1 >= 0) {
      errors.push("target east approach must go left into handle");
    }
  }

  return errors;
}
