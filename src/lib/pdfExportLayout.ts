/**
 * Pure PDF export layout helpers (no DOM). Kept free of browser APIs so
 * CI smoke tests can mirror the same math without a Tauri shell.
 */
import {
  PAGE_MARGIN_MM,
  getPaperSize,
  normalizePaperSizeId,
  paperLayoutPx,
  type PaperSizeId,
} from "./paperSize";

/** Soft cap per embed slice — taller embeds are multi-sliced, not silently cropped. */
export const MAX_EMBED_CAPTURE_HEIGHT_PX = 1800;

/** Bitmap sharpness for paper fit — placement uses mm math, not this factor. */
export const PDF_RASTER_SCALE = 2;

export type EmbedCapturePlan = {
  fullHeightPx: number;
  maxSliceHeightPx: number;
  sliceCount: number;
  sliced: boolean;
  /** Height of each slice top→bottom (last may be shorter). */
  sliceHeightsPx: number[];
};

/**
 * Plan vertical capture slices for a live embed.
 * Heights ≤ max → one slice; taller → ceil(full / max) slices (no silent crop).
 */
export function planEmbedCapture(
  fullHeightPx: number,
  maxSliceHeightPx: number = MAX_EMBED_CAPTURE_HEIGHT_PX,
): EmbedCapturePlan {
  const full = Math.max(1, Math.round(fullHeightPx));
  const maxH = Math.max(1, Math.round(maxSliceHeightPx));
  if (full <= maxH) {
    return {
      fullHeightPx: full,
      maxSliceHeightPx: maxH,
      sliceCount: 1,
      sliced: false,
      sliceHeightsPx: [full],
    };
  }
  const sliceCount = Math.ceil(full / maxH);
  const sliceHeightsPx: number[] = [];
  let remaining = full;
  for (let i = 0; i < sliceCount; i++) {
    const h = Math.min(maxH, remaining);
    sliceHeightsPx.push(h);
    remaining -= h;
  }
  return {
    fullHeightPx: full,
    maxSliceHeightPx: maxH,
    sliceCount,
    sliced: true,
    sliceHeightsPx,
  };
}

export type PdfPaperFitPlacement = {
  paperSizeId: PaperSizeId;
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  /** Explicit content width on the page — Fit-width; never derived from html2canvas.scale. */
  contentWidthMm: number;
  contentHeightMm: number;
  contentWidthPx: number;
};

/** Deterministic jsPDF addImage placement box for the selected paper. */
export function pdfPaperFitPlacement(
  paperSize: PaperSizeId | string = "letter",
): PdfPaperFitPlacement {
  const id = normalizePaperSizeId(paperSize);
  const size = getPaperSize(id);
  const layout = paperLayoutPx(id);
  const marginMm = PAGE_MARGIN_MM;
  return {
    paperSizeId: id,
    paperWidthMm: size.widthMm,
    paperHeightMm: size.heightMm,
    marginMm,
    contentWidthMm: Math.max(1, size.widthMm - marginMm * 2),
    contentHeightMm: Math.max(1, size.heightMm - marginMm * 2),
    contentWidthPx: layout.contentWidthPx,
  };
}

/** Human-readable warning when an embed was split across capture slices. */
export function tallEmbedWarning(label: string, sliceCount: number): string {
  const name = label.trim() || "Embed";
  return `${name}: taller than ${MAX_EMBED_CAPTURE_HEIGHT_PX}px — split into ${sliceCount} images so PDF export is not silently cropped`;
}
