import type { Editor } from "@tiptap/react";
import { toPng } from "html-to-image";
import { writeExportHtml } from "../api";

/** Soft cap — very tall embeds are cropped so print pages stay usable. */
const MAX_CAPTURE_HEIGHT_PX = 1800;
const EMBED_SELECTOR =
  '[data-type="flowchart-embed"], .flowchart-embed, [data-type="rgd-sheet-embed"], .rgd-sheet-card, .rgd-table-embed, .rgd-block, [data-type="mood-board-embed"], .mood-board-embed, [data-type="chart-embed"], .chart-embed';

type CapturedEmbed = {
  dataUrl: string;
  label: string;
  cropped: boolean;
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

function isChartEmbed(el: HTMLElement): boolean {
  return el.matches(".chart-embed, [data-type='chart-embed']");
}

/**
 * Chart embeds load async — wait briefly so the SVG (or a settled empty/error
 * state) is in the live DOM before we rasterize.
 */
async function waitForChartEmbedReady(el: HTMLElement): Promise<void> {
  if (!isChartEmbed(el)) return;
  if (
    el.querySelector(
      ".chart-preview-svg, .chart-preview-empty, .error.embed-status",
    )
  ) {
    return;
  }
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    if (
      el.querySelector(
        ".chart-preview-svg, .chart-preview-empty, .error.embed-status",
      )
    ) {
      return;
    }
  }
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
  if (node.classList.contains("media-embed-chrome")) return true;
  if (node.classList.contains("rgd-embed-resize-handle")) return true;
  // Skip attribution / selection chrome from React Flow if present
  if (node.classList.contains("react-flow__panel")) return true;
  if (node.classList.contains("react-flow__attribution")) return true;
  return false;
}

/**
 * Capture a live embed node as a PNG data URL.
 * Buttons / interactive chrome / ephemeral tips are filtered out of the raster.
 */
async function captureEmbedNode(el: HTMLElement): Promise<CapturedEmbed | null> {
  await waitForChartEmbedReady(el);

  const label = embedLabel(el);
  const fullHeight = Math.max(el.scrollHeight, el.offsetHeight, 1);
  const cropped = fullHeight > MAX_CAPTURE_HEIGHT_PX;
  const height = Math.min(fullHeight, MAX_CAPTURE_HEIGHT_PX);
  const width = Math.max(el.scrollWidth, el.offsetWidth, 1);
  const bg =
    getComputedStyle(el).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    "#1e1e1e";

  const restoreSvgs = prepareSvgsForCapture(el);
  try {
    const dataUrl = await toPng(el, {
      cacheBust: true,
      pixelRatio: cropped || height > 900 ? 1.25 : 2,
      backgroundColor: bg === "rgba(0, 0, 0, 0)" || bg === "transparent" ? "#1e1e1e" : bg,
      width,
      height,
      style: {
        // Ensure off-screen / partially scrolled embeds still paint fully
        transform: "none",
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
    return { dataUrl, label, cropped };
  } catch {
    return null;
  } finally {
    restoreSvgs();
  }
}

function embedLabel(el: HTMLElement): string {
  const title =
    el.querySelector(
      ".flowchart-embed-title, .rgd-live-table-title, .rgd-sheet-card-title, .rgd-block-title, .media-embed-name, .chart-embed-title",
    )
      ?.textContent?.trim() ||
    el.getAttribute("data-flowchart-id") ||
    el.getAttribute("data-sheet-id") ||
    el.getAttribute("data-mood-board-item-id") ||
    el.getAttribute("data-chart-id") ||
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
  root.querySelectorAll(".media-embed-chrome").forEach((el) => el.remove());
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
  const img = document.createElement("img");
  img.src = captured.dataUrl;
  img.alt = captured.label;
  img.className = "export-embed-img";
  figure.appendChild(img);
  const cap = document.createElement("figcaption");
  cap.className = "export-embed-caption";
  cap.textContent = captured.cropped
    ? `${captured.label} (preview cropped for print)`
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

/**
 * Build a print-friendly HTML snapshot of the current TipTap document.
 * Flowchart / RGD / chart embeds are rasterized in place; media kept when feasible.
 */
async function buildExportHtml(
  title: string,
  editor: Editor,
): Promise<string> {
  const liveRoot = editor.view.dom as HTMLElement;
  const liveEmbeds = collectEmbedElements(liveRoot);

  // Capture from the live DOM (canvas / React Flow / chart SVG do not survive cloneNode)
  // Sequential capture keeps SVG prep mutations from overlapping across embeds.
  const captures: Array<CapturedEmbed | null> = [];
  for (const el of liveEmbeds) {
    captures.push(await captureEmbedNode(el));
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
          : el.matches(".mood-board-embed, [data-type='mood-board-embed']")
            ? "Mood Board embed"
            : "RGD embed";
      el.replaceWith(placeholder(kind));
    }
  });

  enhanceMediaForPrint(root);

  const bodyHtml = root.innerHTML;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"/>
<title>${escapeHtml(title)} — GDD Studio</title>
<style>
  @page { margin: 18mm; }
  body {
    font-family: "Iowan Old Style", Palatino, Georgia, serif;
    color: #111;
    background: #fff;
    line-height: 1.55;
    font-size: 12pt;
    max-width: 720px;
    margin: 0 auto;
    padding: 24px;
  }
  h1,h2,h3 { font-family: "Segoe UI", Helvetica, sans-serif; }
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
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
<header><h1>${escapeHtml(title)}</h1></header>
<article>${bodyHtml}</article>
<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),200)});<\/script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Export current editor doc via print dialog (Save as PDF on most desktops).
 * Also persists a snapshot HTML under app data when running in Tauri.
 */
export async function exportDocumentPdf(
  title: string,
  editor: Editor,
): Promise<{ mode: "print"; path?: string }> {
  const html = await buildExportHtml(title, editor);
  let path: string | undefined;
  try {
    path = await writeExportHtml(html);
  } catch {
    /* browser preview: skip disk write */
  }

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer,width=900,height=700");
  if (!win) {
    // Popup blocked — fall back to iframe print
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(url);
        }, 1000);
      }
    };
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return { mode: "print", path };
}
