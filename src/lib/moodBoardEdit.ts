import type { CSSProperties } from "react";
import type { MoodBoardBorder, MoodBoardCrop } from "../types";

const MIN_CROP = 0.05;
const MAX_BORDER_WIDTH = 64;
const MAX_BORDER_RADIUS = 64;

/** Full-frame crop (no crop applied). */
export const FULL_CROP: MoodBoardCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Sanitize and clamp a crop rect; returns null when effectively full-frame. */
export function normalizeCrop(
  crop: MoodBoardCrop | null | undefined,
): MoodBoardCrop | null {
  if (!crop) return null;
  const width = Math.min(1, Math.max(MIN_CROP, Number(crop.width) || 0));
  const height = Math.min(1, Math.max(MIN_CROP, Number(crop.height) || 0));
  const x = Math.min(1 - width, Math.max(0, Number(crop.x) || 0));
  const y = Math.min(1 - height, Math.max(0, Number(crop.y) || 0));
  if (x <= 0.0001 && y <= 0.0001 && width >= 0.9999 && height >= 0.9999) {
    return null;
  }
  return { x, y, width, height };
}

/** Accept #RGB / #RRGGBB / #RRGGBBAA; fallback to white. */
export function sanitizeBorderColor(color: string | null | undefined): string {
  const t = (color ?? "").trim();
  if (
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)
  ) {
    return t.toLowerCase();
  }
  return "#e8e8e8";
}

export function normalizeBorder(
  border: MoodBoardBorder | null | undefined,
): MoodBoardBorder | null {
  if (!border) return null;
  const width = Math.min(
    MAX_BORDER_WIDTH,
    Math.max(0, Math.round(Number(border.width) || 0)),
  );
  if (width <= 0 && (border.radius == null || Number(border.radius) <= 0)) {
    return null;
  }
  const radiusRaw = border.radius;
  const radius =
    radiusRaw == null || !Number.isFinite(Number(radiusRaw))
      ? undefined
      : Math.min(MAX_BORDER_RADIUS, Math.max(0, Math.round(Number(radiusRaw))));
  return {
    width: Math.max(width, radius && radius > 0 ? 0 : width),
    color: sanitizeBorderColor(border.color),
    ...(radius != null && radius > 0 ? { radius } : {}),
  };
}

/**
 * CSS for a cropped <img> inside an overflow:hidden frame.
 *
 * Scale the image so the crop rect fills the frame, then offset with
 * `left`/`top` percentages (relative to the frame). Do not use
 * `transform: translate(%)` for that offset — transform percentages are
 * relative to the transformed element itself, which over-shifts any crop
 * that is not anchored at (0,0) and can leave the embed empty.
 */
export function cropImageStyle(
  crop: MoodBoardCrop | null | undefined,
): { frame: CSSProperties; img: CSSProperties } {
  const c = normalizeCrop(crop);
  if (!c) {
    return {
      frame: {},
      img: { width: "100%", height: "100%", objectFit: "cover" },
    };
  }
  const scaleX = 1 / c.width;
  const scaleY = 1 / c.height;
  return {
    frame: {
      overflow: "hidden",
      width: "100%",
      height: "100%",
      position: "relative",
    },
    img: {
      position: "absolute",
      // Parent-relative offsets: left = -x/width * 100% of frame width.
      left: `${(-c.x / c.width) * 100}%`,
      top: `${(-c.y / c.height) * 100}%`,
      width: `${scaleX * 100}%`,
      height: `${scaleY * 100}%`,
      maxWidth: "none",
      objectFit: "fill",
    },
  };
}

export function borderCss(
  border: MoodBoardBorder | null | undefined,
): CSSProperties {
  const b = normalizeBorder(border);
  if (!b) return {};
  return {
    borderStyle: b.width > 0 ? "solid" : undefined,
    borderWidth: b.width > 0 ? b.width : undefined,
    borderColor: b.width > 0 ? b.color : undefined,
    borderRadius: b.radius != null && b.radius > 0 ? b.radius : undefined,
    boxSizing: "border-box",
  };
}
