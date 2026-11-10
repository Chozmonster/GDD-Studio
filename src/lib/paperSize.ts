/**
 * Shared paper sizes for Print view + PDF export.
 * Dimensions use CSS pixels at 96dpi (1in = 96px) so TipTap pagination
 * matches `@page` sizes in export HTML.
 */

export type PaperSizeId =
  | "letter"
  | "a4"
  | "legal"
  | "tabloid"
  | "a3"
  | "a5";

export type PaperSizeDef = {
  id: PaperSizeId;
  /** Dropdown label */
  label: string;
  /** Short name for UI chips / status */
  shortLabel: string;
  widthMm: number;
  heightMm: number;
};

/** Match existing PDF export `@page { margin: 18mm }`. */
export const PAGE_MARGIN_MM = 18;

/** Visual gap between sheets in Print view (CSS px). */
export const PAGE_GAP_PX = 28;

/** Continuous scroll editor is the default; Print view is a session toggle. */
export type DocumentViewMode = "continuous" | "print";
export const DEFAULT_DOCUMENT_VIEW_MODE: DocumentViewMode = "continuous";

/**
 * Seed for a future Options “default Document view” preference.
 * Keep continuous until that toggle exists.
 */
export const DEFAULT_PAPER_SIZE_ID: PaperSizeId = "letter";

export const PAPER_SIZES: readonly PaperSizeDef[] = [
  {
    id: "letter",
    label: "Letter (8.5 × 11 in)",
    shortLabel: "Letter",
    widthMm: 215.9,
    heightMm: 279.4,
  },
  {
    id: "a4",
    label: "A4 (210 × 297 mm)",
    shortLabel: "A4",
    widthMm: 210,
    heightMm: 297,
  },
  {
    id: "legal",
    label: "Legal (8.5 × 14 in)",
    shortLabel: "Legal",
    widthMm: 215.9,
    heightMm: 355.6,
  },
  {
    id: "tabloid",
    label: "Tabloid (11 × 17 in)",
    shortLabel: "Tabloid",
    widthMm: 279.4,
    heightMm: 431.8,
  },
  {
    id: "a3",
    label: "A3 (297 × 420 mm)",
    shortLabel: "A3",
    widthMm: 297,
    heightMm: 420,
  },
  {
    id: "a5",
    label: "A5 (148 × 210 mm)",
    shortLabel: "A5",
    widthMm: 148,
    heightMm: 210,
  },
] as const;

const BY_ID = Object.fromEntries(
  PAPER_SIZES.map((s) => [s.id, s]),
) as Record<PaperSizeId, PaperSizeDef>;

export function isPaperSizeId(value: unknown): value is PaperSizeId {
  return typeof value === "string" && value in BY_ID;
}

export function normalizePaperSizeId(value: unknown): PaperSizeId {
  return isPaperSizeId(value) ? value : DEFAULT_PAPER_SIZE_ID;
}

export function getPaperSize(id: PaperSizeId | string | null | undefined): PaperSizeDef {
  return BY_ID[normalizePaperSizeId(id)];
}

/** CSS px from millimeters at 96dpi. */
export function mmToPx(mm: number): number {
  return (mm / 25.4) * 96;
}

export type PaperLayoutPx = {
  id: PaperSizeId;
  widthPx: number;
  heightPx: number;
  marginPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  /** TipTap PaginationPlus page-size object (full sheet + margins). */
  paginationSize: {
    pageWidth: number;
    pageHeight: number;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  };
  /** CSS `@page size` value, e.g. `letter` or `210mm 297mm`. */
  cssPageSize: string;
};

const CSS_NAMED: Partial<Record<PaperSizeId, string>> = {
  letter: "letter",
  a4: "A4",
  legal: "legal",
  a3: "A3",
  a5: "A5",
  // Tabloid is not universally named in @page — use explicit mm.
};

export function paperLayoutPx(id: PaperSizeId | string | null | undefined): PaperLayoutPx {
  const size = getPaperSize(id);
  const widthPx = Math.round(mmToPx(size.widthMm));
  const heightPx = Math.round(mmToPx(size.heightMm));
  const marginPx = Math.round(mmToPx(PAGE_MARGIN_MM));
  const cssPageSize =
    CSS_NAMED[size.id] ?? `${size.widthMm}mm ${size.heightMm}mm`;

  return {
    id: size.id,
    widthPx,
    heightPx,
    marginPx,
    contentWidthPx: Math.max(1, widthPx - marginPx * 2),
    contentHeightPx: Math.max(1, heightPx - marginPx * 2),
    paginationSize: {
      pageWidth: widthPx,
      pageHeight: heightPx,
      marginTop: marginPx,
      marginBottom: marginPx,
      marginLeft: marginPx,
      marginRight: marginPx,
    },
    cssPageSize,
  };
}
