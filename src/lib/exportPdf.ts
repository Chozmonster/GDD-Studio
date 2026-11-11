import type { Editor } from "@tiptap/react";
import { toPng } from "html-to-image";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  ensureProjectExportsDir,
  pickPdfSavePath,
  writeExportPdf,
} from "../api";
import {
  PAGE_MARGIN_MM,
  getPaperSize,
  normalizePaperSizeId,
  paperLayoutPx,
  type PaperSizeId,
} from "./paperSize";
import {
  MAX_EMBED_CAPTURE_HEIGHT_PX,
  PDF_RASTER_SCALE,
  pdfPaperFitPlacement,
  planEmbedCapture,
  tallEmbedWarning,
} from "./pdfExportLayout";

/** Avoid oversized canvases on long docs (browser texture limits). */
const MAX_PDF_CANVAS_EDGE_PX = 8192;
const EMBED_SELECTOR =
  '[data-type="flowchart-embed"], .flowchart-embed, [data-type="rgd-sheet-embed"], .rgd-sheet-card, .rgd-table-embed, .rgd-block, [data-type="mood-board-embed"], .mood-board-embed, [data-type="chart-embed"], .chart-embed, [data-type="whiteboard-embed"], .whiteboard-embed';

/** Title / open-editor bars — strip from PNG capture like media chrome. */
const EMBED_CHROME_SELECTOR = [
  ".media-embed-chrome",
  ".flowchart-embed-chrome",
  ".rgd-sheet-card-chrome",
  ".chart-embed-chrome",
  ".mood-board-embed-chrome",
  ".whiteboard-embed-chrome",
].join(", ");

type ExportEmbedAlign = "left" | "center" | "right" | "justify";

function normalizeExportAlign(raw: string | null): ExportEmbedAlign {
  if (raw === "center" || raw === "right" || raw === "justify") return raw;
  return "left";
}

type CapturedEmbed = {
  /** One or more vertical slices (tall embeds are multi-sliced, not cropped). */
  dataUrls: string[];
  label: string;
  sliced: boolean;
  sliceCount: number;
  /** Live editor card width — keeps PDF layout in sync with user resize. */
  widthPx: number;
  textAlign: ExportEmbedAlign;
};

const SVG_COLOR_ATTRS = [
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "color",
] as const;

/** Outermost flowchart / RGD / chart embed nodes only (avoid nested selector doubles). */
function collectEmbedElements(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    root.querySelectorAll(EMBED_SELECTOR),
  ) as HTMLElement[];
  return nodes.filter(
    (el) => !nodes.some((other) => other !== el && other.contains(el)),
  );
}

function isSettledEmbed(el: HTMLElement): boolean {
  if (el.querySelector(".error.embed-status, .broken")) return true;
  if (el.matches(".chart-embed, [data-type='chart-embed']")) {
    return Boolean(
      el.querySelector(".chart-preview-svg, .chart-preview-empty"),
    );
  }
  if (el.matches(".flowchart-embed, [data-type='flowchart-embed']")) {
    return Boolean(el.querySelector(".flowchart-preview, .react-flow"));
  }
  if (
    el.matches(
      ".rgd-sheet-card, .rgd-table-embed, [data-type='rgd-sheet-embed'], .rgd-block",
    )
  ) {
    return Boolean(el.querySelector(".rgd-live-table, .rgd-embed-table"));
  }
  if (el.matches(".mood-board-embed, [data-type='mood-board-embed']")) {
    return Boolean(
      el.querySelector(
        ".mood-board-embed-body, .mood-board-embed-palette, .mood-media-frame",
      ),
    );
  }
  if (el.matches(".whiteboard-embed, [data-type='whiteboard-embed']")) {
    return Boolean(
      el.querySelector(
        ".whiteboard-preview-svg, .whiteboard-preview-empty, .error.embed-status",
      ),
    );
  }
  return true;
}

/**
 * Live embeds load async — wait briefly so preview content (or a settled
 * empty/error state) is in the DOM before we rasterize.
 */
async function waitForEmbedReady(el: HTMLElement): Promise<void> {
  if (isSettledEmbed(el)) return;
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    if (isSettledEmbed(el)) return;
  }
}

function readEmbedLayout(el: HTMLElement): {
  widthPx: number;
  textAlign: ExportEmbedAlign;
} {
  const fromData = Number.parseInt(el.getAttribute("data-width") ?? "", 10);
  const measured = Math.max(el.offsetWidth, el.scrollWidth, 1);
  const widthPx =
    Number.isFinite(fromData) && fromData > 0
      ? Math.min(fromData, measured > 1 ? measured : fromData)
      : measured;
  return {
    widthPx,
    textAlign: normalizeExportAlign(el.getAttribute("data-text-align")),
  };
}

/**
 * html-to-image re-serializes SVG into a standalone image document. CSS custom
 * properties in presentation attributes do not resolve there — bake computed
 * colors (and explicit width/height) so axes/grid/text survive the raster.
 */
function prepareSvgsForCapture(root: HTMLElement): () => void {
  const restores: Array<() => void> = [];
  const svgs = Array.from(root.querySelectorAll("svg"));
  for (const svg of svgs) {
    const svgEl = svg as SVGSVGElement;
    const box = svgEl.getBoundingClientRect();
    const prevW = svgEl.getAttribute("width");
    const prevH = svgEl.getAttribute("height");
    if ((!prevW || prevW === "auto") && box.width > 0) {
      svgEl.setAttribute("width", String(Math.round(box.width)));
    }
    if ((!prevH || prevH === "auto") && box.height > 0) {
      svgEl.setAttribute("height", String(Math.round(box.height)));
    }
    restores.push(() => {
      if (prevW === null) svgEl.removeAttribute("width");
      else svgEl.setAttribute("width", prevW);
      if (prevH === null) svgEl.removeAttribute("height");
      else svgEl.setAttribute("height", prevH);
    });

    const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll("*"))];
    for (const node of nodes) {
      for (const attr of SVG_COLOR_ATTRS) {
        const raw = node.getAttribute(attr);
        if (!raw || !raw.includes("var(")) continue;
        const computed = getComputedStyle(node).getPropertyValue(attr).trim();
        if (!computed || computed === "none") continue;
        node.setAttribute(attr, computed);
        restores.push(() => node.setAttribute(attr, raw));
      }
    }
  }
  return () => {
    for (let i = restores.length - 1; i >= 0; i--) restores[i]!();
  };
}

function shouldSkipExportNode(node: HTMLElement): boolean {
  if (node.tagName === "BUTTON") return true;
  if (node.hasAttribute("data-export-ignore")) return true;
  if (node.classList.contains("rgd-embed-resize-handle")) return true;
  if (
    node.classList.contains("media-embed-chrome") ||
    node.classList.contains("flowchart-embed-chrome") ||
    node.classList.contains("rgd-sheet-card-chrome") ||
    node.classList.contains("chart-embed-chrome") ||
    node.classList.contains("mood-board-embed-chrome") ||
    node.classList.contains("whiteboard-embed-chrome")
  ) {
    return true;
  }
  // Skip attribution / selection chrome from React Flow if present
  if (node.classList.contains("react-flow__panel")) return true;
  if (node.classList.contains("react-flow__attribution")) return true;
  return false;
}

/**
 * Capture a live embed node as one or more PNG data URLs.
 * Tall embeds (> MAX_EMBED_CAPTURE_HEIGHT_PX) are multi-sliced vertically so
 * PDF export is not silently cropped. Buttons / chrome / tips are filtered out.
 */
async function captureEmbedNode(el: HTMLElement): Promise<CapturedEmbed | null> {
  await waitForEmbedReady(el);

  const label = embedLabel(el);
  const layout = readEmbedLayout(el);
  const fullHeight = Math.max(el.scrollHeight, el.offsetHeight, 1);
  const plan = planEmbedCapture(fullHeight, MAX_EMBED_CAPTURE_HEIGHT_PX);
  const width = Math.max(el.scrollWidth, el.offsetWidth, 1);
  const bg =
    getComputedStyle(el).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    "#1e1e1e";
  const backgroundColor =
    bg === "rgba(0, 0, 0, 0)" || bg === "transparent" ? "#1e1e1e" : bg;

  const restoreSvgs = prepareSvgsForCapture(el);
  try {
    const dataUrls: string[] = [];
    let offsetY = 0;
    for (let i = 0; i < plan.sliceCount; i++) {
      const sliceH = plan.sliceHeightsPx[i]!;
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: plan.sliced || sliceH > 900 ? 1.25 : 2,
        backgroundColor,
        width,
        height: sliceH,
        style: {
          // Translate the full embed up so this slice's band fills the capture box.
          height: `${plan.fullHeightPx}px`,
          transform: offsetY === 0 ? "none" : `translateY(-${offsetY}px)`,
          overflow: "hidden",
        },
        filter: (node) => {
          // TipTap/HTML tips use data-export-ignore; match Element (not only HTMLElement).
          if (node instanceof Element && node.hasAttribute("data-export-ignore")) {
            return false;
          }
          if (!(node instanceof HTMLElement)) return true;
          return !shouldSkipExportNode(node);
        },
      });
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
      dataUrls.push(dataUrl);
      offsetY += sliceH;
    }
    return {
      dataUrls,
      label,
      sliced: plan.sliced,
      sliceCount: plan.sliceCount,
      widthPx: layout.widthPx,
      textAlign: layout.textAlign,
    };
  } catch {
    return null;
  } finally {
    restoreSvgs();
  }
}

function embedLabel(el: HTMLElement): string {
  const title =
    el.querySelector(
      ".flowchart-embed-title, .rgd-live-table-title, .rgd-sheet-card-title, .rgd-block-title, .media-embed-name, .chart-embed-title, .whiteboard-embed-title",
    )
      ?.textContent?.trim() ||
    el.getAttribute("data-flowchart-id") ||
    el.getAttribute("data-sheet-id") ||
    el.getAttribute("data-mood-board-item-id") ||
    el.getAttribute("data-chart-id") ||
    el.getAttribute("data-whiteboard-id") ||
    "";
  if (el.matches(".flowchart-embed, [data-type='flowchart-embed']")) {
    return title || "Flowchart";
  }
  if (
    el.matches(
      ".rgd-sheet-card, .rgd-table-embed, [data-type='rgd-sheet-embed'], .rgd-block",
    )
  ) {
    return title || "RGD";
  }
  if (el.matches(".mood-board-embed, [data-type='mood-board-embed']")) {
    return title || "Mood Board";
  }
  if (el.matches(".chart-embed, [data-type='chart-embed']")) {
    return title || "Graph";
  }
  if (el.matches(".whiteboard-embed, [data-type='whiteboard-embed']")) {
    return (
      title ||
      el.getAttribute("data-whiteboard-name")?.trim() ||
      el.getAttribute("data-whiteboard-id") ||
      "Whiteboard"
    );
  }
  return title || "Embed";
}

function isDangerousUrl(value: string): boolean {
  const v = value.trim();
  if (/^(javascript|vbscript|file):/i.test(v)) return true;
  if (/^data:/i.test(v)) {
    // SVG-in-data-URL can execute script if navigated; never allow in export HTML.
    if (/^data:image\/svg\+xml/i.test(v)) return true;
    // Allow raster/media data URLs used by export snapshots and asset fallbacks
    return !/^data:(image\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+)[;,]/i.test(
      v,
    );
  }
  return false;
}

function scrubExportRoot(root: HTMLElement): void {
  root.querySelectorAll("[contenteditable]").forEach((el) => {
    el.removeAttribute("contenteditable");
  });
  root.querySelectorAll(EMBED_CHROME_SELECTOR).forEach((el) => el.remove());
  root.querySelectorAll(".rgd-embed-resize-handle").forEach((el) => el.remove());
  // Ephemeral UI (e.g. chart hover tooltips) must not appear in export HTML.
  root.querySelectorAll("[data-export-ignore]").forEach((el) => el.remove());

  // Harden export HTML: drop executable / navigable attack surfaces from cloned TipTap DOM
  root
    .querySelectorAll("script, iframe, object, embed, link, meta, svg")
    .forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        el.removeAttribute(attr.name);
      }
      if (
        (name === "href" || name === "src" || name === "xlink:href") &&
        isDangerousUrl(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

function replaceVariablesAndWiki(root: HTMLElement): void {
  root.querySelectorAll(".variable-chip").forEach((el) => {
    const text = el.textContent?.trim() ?? "";
    el.replaceWith(document.createTextNode(text));
  });

  // Section links → markdown-ish label
  root.querySelectorAll(".wiki-link").forEach((el) => {
    const text = el.textContent?.trim() ?? "link";
    const span = document.createElement("span");
    span.textContent = `⟦${text}⟧`;
    el.replaceWith(span);
  });
}

function figureFromCapture(captured: CapturedEmbed): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "export-embed";
  // Match editor card width + text alignment (media embeds already keep
  // inline width/align on their wrappers; screenshot embeds need this).
  figure.style.width = "100%";
  figure.style.maxWidth = `${Math.max(1, Math.round(captured.widthPx))}px`;
  if (captured.textAlign === "center") {
    figure.style.marginLeft = "auto";
    figure.style.marginRight = "auto";
  } else if (captured.textAlign === "right") {
    figure.style.marginLeft = "auto";
    figure.style.marginRight = "0";
  } else {
    figure.style.marginLeft = "0";
    figure.style.marginRight = "auto";
  }
  figure.setAttribute("data-text-align", captured.textAlign);
  if (captured.sliced) {
    figure.setAttribute("data-export-sliced", String(captured.sliceCount));
  }
  captured.dataUrls.forEach((dataUrl, index) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt =
      captured.sliceCount > 1
        ? `${captured.label} (part ${index + 1} of ${captured.sliceCount})`
        : captured.label;
    img.className = "export-embed-img";
    if (index > 0) {
      img.style.marginTop = "4pt";
    }
    figure.appendChild(img);
  });
  const cap = document.createElement("figcaption");
  cap.className = "export-embed-caption";
  cap.textContent = captured.sliced
    ? `${captured.label} (tall embed — split into ${captured.sliceCount} images for print)`
    : captured.label;
  figure.appendChild(cap);
  return figure;
}

function placeholder(kind: string): HTMLElement {
  const cap = document.createElement("p");
  cap.className = "export-placeholder";
  cap.textContent = `[${kind} — could not capture snapshot]`;
  return cap;
}

/**
 * Prefer a still frame for video when the browser can paint one; otherwise keep
 * the <video> tag (print engines often show the poster/first frame).
 */
function enhanceMediaForPrint(root: HTMLElement): void {
  root.querySelectorAll("video.media-embed-video, .media-embed video").forEach((node) => {
    const video = node as HTMLVideoElement;
    try {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const url = canvas.toDataURL("image/jpeg", 0.85);
          if (url.startsWith("data:image/")) {
            const img = document.createElement("img");
            img.src = url;
            img.alt = video.getAttribute("aria-label") || "Video frame";
            img.className = "export-embed-img";
            const note = document.createElement("p");
            note.className = "export-embed-caption";
            note.textContent = "Video (single frame)";
            const wrap = document.createElement("figure");
            wrap.className = "export-embed";
            wrap.appendChild(img);
            wrap.appendChild(note);
            video.replaceWith(wrap);
          }
        }
      }
    } catch {
      /* keep <video> — CORS/tainted canvas or not ready */
    }
  });
}
type BuildExportHtmlResult = {
  html: string;
  warnings: string[];
};

/**
 * Build a print-layout HTML snapshot of the current TipTap document.
 * Flowchart / RGD / chart embeds are rasterized in place; media kept when feasible.
 * Used only as an intermediate for direct PDF generation — never shown to the user.
 */
async function buildExportHtml(
  title: string,
  editor: Editor,
  paperSize: PaperSizeId,
): Promise<BuildExportHtmlResult> {
  const layout = paperLayoutPx(paperSize);
  const liveRoot = editor.view.dom as HTMLElement;
  const liveEmbeds = collectEmbedElements(liveRoot);

  // Capture from the live DOM (canvas / React Flow / chart SVG do not survive cloneNode)
  // Sequential capture keeps SVG prep mutations from overlapping across embeds.
  const captures: Array<CapturedEmbed | null> = [];
  const warnings: string[] = [];
  for (const el of liveEmbeds) {
    const captured = await captureEmbedNode(el);
    captures.push(captured);
    if (captured?.sliced) {
      warnings.push(tallEmbedWarning(captured.label, captured.sliceCount));
    }
  }

  const root = liveRoot.cloneNode(true) as HTMLElement;
  scrubExportRoot(root);
  replaceVariablesAndWiki(root);

  const clonedEmbeds = collectEmbedElements(root);

  clonedEmbeds.forEach((el, i) => {
    const captured = captures[i];
    if (captured) {
      el.replaceWith(figureFromCapture(captured));
    } else {
      const kind = el.matches(".flowchart-embed, [data-type='flowchart-embed']")
        ? "Flowchart embed"
        : el.matches(".chart-embed, [data-type='chart-embed']")
          ? "Graph embed"
          : el.matches(".whiteboard-embed, [data-type='whiteboard-embed']")
            ? "Whiteboard embed"
            : el.matches(".mood-board-embed, [data-type='mood-board-embed']")
              ? "Mood Board embed"
              : "RGD embed";
      el.replaceWith(placeholder(kind));
    }
  });

  enhanceMediaForPrint(root);

  const bodyHtml = root.innerHTML;

  // Margins are applied by jsPDF (PAGE_MARGIN_MM); body padding stays 0 to avoid doubling.
  // Light paper ink is locked here — capture rasters inside this iframe so host App.css
  // dark theme cannot leak (do not use pdf.html() which clones into the host document).
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"/>
<title>${escapeHtml(title)} — GDD Studio</title>
<style>
  @page {
    size: ${layout.cssPageSize};
    margin: ${PAGE_MARGIN_MM}mm;
  }
  html, body {
    margin: 0;
    padding: 0;
  }
  body {
    font-family: "Iowan Old Style", Palatino, Georgia, serif;
    color: #111 !important;
    background: #fff !important;
    line-height: 1.55;
    font-size: 12pt;
    width: ${layout.contentWidthPx}px;
    max-width: ${layout.contentWidthPx}px;
    box-sizing: border-box;
  }
  /* Neutralize editor dark-theme classes that may appear in cloned TipTap HTML. */
  article, article * {
    color: inherit;
    background-color: transparent;
  }
  h1,h2,h3 { font-family: "Segoe UI", Helvetica, sans-serif; color: #111; }
  img, video { max-width: 100%; height: auto; }
  audio { width: 100%; }
  .export-placeholder {
    border: 1px dashed #888;
    padding: 8px 12px;
    color: #444;
    font-family: "Segoe UI", Helvetica, sans-serif;
    font-size: 10pt;
  }
  .export-embed {
    margin: 12pt 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .export-embed-img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .export-embed-caption {
    margin: 4pt 0 0;
    font-family: "Segoe UI", Helvetica, sans-serif;
    font-size: 9pt;
    color: #555;
  }
  .spell-error { text-decoration: none; }
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1></header>
<article>${bodyHtml}</article>
</body>
</html>`;

  return { html, warnings };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Safe default PDF filename from the document title. */
export function suggestPdfFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");
  const base = (cleaned || "document").slice(0, 80);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function joinPath(dir: string, file: string): string {
  const trimmed = dir.replace(/[/\\]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${file}`;
}

async function waitForExportDocument(doc: Document): Promise<void> {
  const fonts = (
    doc as Document & { fonts?: { ready?: Promise<unknown> } }
  ).fonts?.ready;
  if (fonts) {
    try {
      await fonts;
    } catch {
      /* ignore */
    }
  }
  const images = Array.from(doc.images ?? []);
  await Promise.all(
    images.map((img) =>
      img.decode().catch(() => {
        /* broken/missing image — continue */
      }),
    ),
  );
}

/**
 * Rasterize the export document inside its iframe (so print CSS stays applied),
 * then place the bitmap onto jsPDF pages with explicit mm fit-to-paper width.
 *
 * Avoids `pdf.html()` which clones the iframe `<body>` into the host document,
 * drops `<head>` styles, and picks up the dark editor theme — and whose
 * html2canvas.scale / width / windowWidth coupling has repeatedly oversized
 * content.
 */
async function htmlToPdfBytes(
  html: string,
  paperSize: PaperSizeId,
): Promise<Uint8Array> {
  const fit = pdfPaperFitPlacement(paperSize);
  const size = getPaperSize(fit.paperSizeId);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${fit.contentWidthPx}px`,
    "height:200px",
    "border:0",
    "opacity:0",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error("Could not create export document for PDF");
    }
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") {
        resolve();
        return;
      }
      iframe.addEventListener("load", () => resolve(), { once: true });
      // Safety: some WebViews never fire load after document.write.
      setTimeout(() => resolve(), 250);
    });
    await waitForExportDocument(doc);

    const body = doc.body;
    const contentHeightPx = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      doc.documentElement.scrollHeight,
      1,
    );
    iframe.style.height = `${contentHeightPx}px`;

    // Bitmap scale is sharpness only; PDF page placement uses mm math below.
    // May drop below 1 for very long docs so the canvas stays within browser limits.
    let rasterScale = PDF_RASTER_SCALE;
    const tallestEdgePx = Math.max(fit.contentWidthPx, contentHeightPx);
    if (tallestEdgePx * rasterScale > MAX_PDF_CANVAS_EDGE_PX) {
      rasterScale = MAX_PDF_CANVAS_EDGE_PX / tallestEdgePx;
    }

    // Rasterize inside the iframe so print CSS (light paper ink) stays applied.
    // Never use pdf.html() — it clones into the host document and picks up App dark theme.
    const canvas = await html2canvas(body, {
      scale: rasterScale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: fit.contentWidthPx,
      windowWidth: fit.contentWidthPx,
      height: contentHeightPx,
      windowHeight: contentHeightPx,
    });

    const pdf = new jsPDF({
      unit: "mm",
      format: [size.widthMm, size.heightMm],
      orientation: size.widthMm > size.heightMm ? "landscape" : "portrait",
      compress: true,
    });

    const margin = fit.marginMm;
    const contentWidthMm = fit.contentWidthMm;
    const contentHeightMm = fit.contentHeightMm;
    // Paper-fit width is explicit mm — independent of html2canvas.scale.
    const imgWidthMm = contentWidthMm;
    const imgHeightMm = (canvas.height * imgWidthMm) / Math.max(1, canvas.width);
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    let heightLeft = imgHeightMm;
    let y = margin;
    pdf.addImage(imgData, "JPEG", margin, y, imgWidthMm, imgHeightMm);
    heightLeft -= contentHeightMm;
    while (heightLeft > 0.5) {
      y = margin - (imgHeightMm - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, y, imgWidthMm, imgHeightMm);
      heightLeft -= contentHeightMm;
    }

    return new Uint8Array(pdf.output("arraybuffer"));
  } finally {
    iframe.remove();
  }
}

export type ExportPdfResult =
  | { mode: "file"; path: string; warnings: string[] }
  | { mode: "cancelled" };

export type ExportPdfOptions = {
  /** Active project id — used to create/default `<project>/exports`. */
  projectId: string;
};

/**
 * Export the current editor doc as a real PDF file via the Tauri save dialog.
 * Defaults to `<project>/exports/<doc-title>.pdf` (creates `exports/` if needed).
 * Reuses Options paper size / Print-view layout. No HTML or print-dialog UX.
 */
export async function exportDocumentPdf(
  title: string,
  editor: Editor,
  paperSize: PaperSizeId | string = "letter",
  options: ExportPdfOptions,
): Promise<ExportPdfResult> {
  const normalized = normalizePaperSizeId(paperSize);
  const filename = suggestPdfFilename(title);

  const exportsDir = await ensureProjectExportsDir(options.projectId);
  const defaultPath = joinPath(exportsDir, filename);
  let path = await pickPdfSavePath(defaultPath);
  if (!path) {
    return { mode: "cancelled" };
  }
  if (!path.toLowerCase().endsWith(".pdf")) {
    path = `${path}.pdf`;
  }

  const { html, warnings } = await buildExportHtml(title, editor, normalized);
  const bytes = await htmlToPdfBytes(html, normalized);
  const written = await writeExportPdf(path, bytes);
  return { mode: "file", path: written, warnings };
}
