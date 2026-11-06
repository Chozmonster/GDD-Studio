/**
 * Off-board colour palette extraction for Mood Board selections.
 *
 * Pipeline: downscale ~200×200 → RGB pixels → k-means → drop pure white/black
 * extremes → rank by dominance → labeled PNG. No heavy deps (local k-means).
 */

export type Rgb = { r: number; g: number; b: number };

export type PaletteColour = {
  hex: string;
  rgb: Rgb;
  /** Fraction of assigned pixels (0–1) before white/black filtering. */
  dominance: number;
};

const TARGET_SIZE = 200;
/** Treat near-pure white/black as extremes to drop from the final palette. */
const EXTREME_THRESHOLD = 8;
const KMEANS_MAX_ITER = 24;
const KMEANS_RESTARTS = 4;

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function isExtremeNeutral(
  { r, g, b }: Rgb,
  threshold = EXTREME_THRESHOLD,
): boolean {
  const nearBlack = r <= threshold && g <= threshold && b <= threshold;
  const nearWhite =
    r >= 255 - threshold && g >= 255 - threshold && b >= 255 - threshold;
  return nearBlack || nearWhite;
}

export function isImageLikeKind(kind: string): boolean {
  const k = kind.toLowerCase();
  return k === "image" || k === "gif";
}

/** Downscale image URL to ~200×200 and return RGB samples (ignores alpha < 16). */
export async function extractPixelsFromImageSrc(
  src: string,
): Promise<Rgb[]> {
  const img = await loadImage(src);
  const { width, height } = fitContain(img.naturalWidth, img.naturalHeight, TARGET_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create canvas for palette analysis");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 16) continue;
    pixels.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
  }
  return pixels;
}

function fitContain(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: max, height: max };
  const scale = Math.min(max / w, max / h, 1);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for palette"));
    img.src = src;
  });
}

function dist2(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function meanOf(points: Rgb[]): Rgb {
  if (points.length === 0) return { r: 0, g: 0, b: 0 };
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of points) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  const n = points.length;
  return { r: r / n, g: g / n, b: b / n };
}

/** k-means++ style init with deterministic-ish random from pixel length. */
function initCentroids(pixels: Rgb[], k: number, seed: number): Rgb[] {
  const centroids: Rgb[] = [];
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  centroids.push(pixels[Math.floor(rand() * pixels.length)]!);
  while (centroids.length < k) {
    const weights = pixels.map((p) => {
      let best = Infinity;
      for (const c of centroids) best = Math.min(best, dist2(p, c));
      return best;
    });
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let pick = rand() * total;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i]!;
      if (pick <= 0) {
        idx = i;
        break;
      }
      idx = i;
    }
    centroids.push(pixels[idx]!);
  }
  return centroids.map((c) => ({ ...c }));
}

function runKMeans(pixels: Rgb[], k: number, seed: number): {
  centroids: Rgb[];
  counts: number[];
  inertia: number;
} {
  let centroids = initCentroids(pixels, k, seed);
  const assignments = new Array<number>(pixels.length).fill(0);
  for (let iter = 0; iter < KMEANS_MAX_ITER; iter++) {
    let changed = false;
    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(pixels[i]!, centroids[c]!);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    const buckets: Rgb[][] = Array.from({ length: k }, () => []);
    for (let i = 0; i < pixels.length; i++) {
      buckets[assignments[i]!]!.push(pixels[i]!);
    }
    centroids = buckets.map((bucket, i) =>
      bucket.length ? meanOf(bucket) : centroids[i]!,
    );
    if (!changed) break;
  }
  const counts = new Array<number>(k).fill(0);
  let inertia = 0;
  for (let i = 0; i < pixels.length; i++) {
    const c = assignments[i]!;
    counts[c]!++;
    inertia += dist2(pixels[i]!, centroids[c]!);
  }
  return { centroids, counts, inertia };
}

/**
 * Cluster pooled pixels into up to `k` colours, drop near-pure white/black,
 * rank remaining by dominance.
 */
export function extractPalette(pixels: Rgb[], k: number): PaletteColour[] {
  const targetK = Math.max(1, Math.min(16, Math.floor(k)));
  if (pixels.length === 0) return [];

  const uniqueHint = Math.min(targetK, pixels.length);
  let best: ReturnType<typeof runKMeans> | null = null;
  for (let r = 0; r < KMEANS_RESTARTS; r++) {
    const result = runKMeans(pixels, uniqueHint, pixels.length * 31 + r * 97);
    if (!best || result.inertia < best.inertia) best = result;
  }
  if (!best) return [];

  const total = pixels.length;
  const colours: PaletteColour[] = [];
  for (let i = 0; i < best.centroids.length; i++) {
    const count = best.counts[i] ?? 0;
    if (count <= 0) continue;
    const rgb = {
      r: Math.round(best.centroids[i]!.r),
      g: Math.round(best.centroids[i]!.g),
      b: Math.round(best.centroids[i]!.b),
    };
    if (isExtremeNeutral(rgb)) continue;
    colours.push({
      rgb,
      hex: rgbToHex(rgb),
      dominance: count / total,
    });
  }
  colours.sort((a, b) => b.dominance - a.dominance);
  return colours.slice(0, targetK);
}

/** Structured comment prefix so tiles can offer click-to-copy hex chips. */
export const PALETTE_COMMENT_PREFIX = "Palette:";

export function formatPaletteComment(colours: PaletteColour[]): string {
  return `${PALETTE_COMMENT_PREFIX} ${colours.map((c) => c.hex).join(" · ")}`;
}

export function parsePaletteHexes(comment: string): string[] | null {
  const trimmed = comment.trim();
  if (!trimmed.toLowerCase().startsWith(PALETTE_COMMENT_PREFIX.toLowerCase())) {
    return null;
  }
  const body = trimmed.slice(PALETTE_COMMENT_PREFIX.length).trim();
  const hexes = body
    .split(/[·,|\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^#[0-9A-F]{6}$/.test(s));
  return hexes.length ? hexes : null;
}

/** Render a clean labeled colour-block PNG (no source-tile mutation). */
export async function renderPalettePng(
  colours: PaletteColour[],
): Promise<Blob> {
  const blockW = 160;
  const blockH = 120;
  const labelH = 36;
  const pad = 16;
  const gap = 12;
  const n = Math.max(1, colours.length);
  const width = pad * 2 + n * blockW + (n - 1) * gap;
  const height = pad * 2 + blockH + labelH + 8;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create palette canvas");

  ctx.fillStyle = "#1a1d24";
  ctx.fillRect(0, 0, width, height);

  colours.forEach((c, i) => {
    const x = pad + i * (blockW + gap);
    const y = pad;
    ctx.fillStyle = c.hex;
    ctx.fillRect(x, y, blockW, blockH);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, blockW - 1, blockH - 1);

    ctx.fillStyle = "#e8eaef";
    ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(c.hex, x + blockW / 2, y + blockH + 10);

    const pct = `${Math.round(c.dominance * 100)}%`;
    ctx.fillStyle = "rgba(232,234,239,0.65)";
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(pct, x + blockW / 2, y + blockH + 28);
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Palette PNG encode failed"))),
      "image/png",
    );
  });
  return blob;
}

export async function buildPaletteFromImageSrcs(
  srcs: string[],
  k: number,
): Promise<{ colours: PaletteColour[]; blob: Blob; comment: string }> {
  const pooled: Rgb[] = [];
  for (const src of srcs) {
    const pixels = await extractPixelsFromImageSrc(src);
    pooled.push(...pixels);
  }
  if (pooled.length === 0) {
    throw new Error("No opaque pixels found in the selected images");
  }
  const colours = extractPalette(pooled, k);
  if (colours.length === 0) {
    throw new Error(
      "No usable colours after filtering pure white/black extremes — try different images or a higher k",
    );
  }
  const blob = await renderPalettePng(colours);
  return {
    colours,
    blob,
    comment: formatPaletteComment(colours),
  };
}
