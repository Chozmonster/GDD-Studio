import type { Editor } from "@tiptap/react";
import { writeExportHtml } from "../api";

/**
 * Build a print-friendly HTML snapshot of the current TipTap document.
 * Media embeds become <img>/<video>/<audio> when src is resolvable in the DOM;
 * flowchart / RGD / variable chips export as labeled placeholders.
 */
export function buildExportHtml(
  title: string,
  editor: Editor,
): string {
  const root = editor.view.dom.cloneNode(true) as HTMLElement;

  // Strip interactive chrome / contenteditable noise
  root.querySelectorAll("[contenteditable]").forEach((el) => {
    el.removeAttribute("contenteditable");
  });
  root.querySelectorAll(".media-embed-chrome").forEach((el) => el.remove());

  // Variable chips → plain text of visible value
  root.querySelectorAll(".variable-chip").forEach((el) => {
    const text = el.textContent?.trim() ?? "";
    el.replaceWith(document.createTextNode(text));
  });

  // Wiki links → markdown-ish label
  root.querySelectorAll(".wiki-link").forEach((el) => {
    const text = el.textContent?.trim() ?? "link";
    const span = document.createElement("span");
    span.textContent = `⟦${text}⟧`;
    el.replaceWith(span);
  });

  // Flowchart / RGD embeds → caption placeholders (live canvases don't print well)
  root.querySelectorAll('[data-type="flowchart-embed"], .flowchart-embed').forEach((el) => {
    const cap = document.createElement("p");
    cap.className = "export-placeholder";
    cap.textContent = `[Flowchart embed — open in GDD Studio]`;
    el.replaceWith(cap);
  });
  root.querySelectorAll('[data-type="rgd-sheet-embed"], .rgd-sheet-card, .rgd-block').forEach((el) => {
    const cap = document.createElement("p");
    cap.className = "export-placeholder";
    cap.textContent = `[RGD embed — open in GDD Studio]`;
    el.replaceWith(cap);
  });

  const bodyHtml = root.innerHTML;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
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
  const html = buildExportHtml(title, editor);
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
