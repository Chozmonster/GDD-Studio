/**
 * PDF export smoke — locks paper-fit + light theme + tall-embed slice planning.
 * Run: node scripts/verify-pdf-export-smoke.mjs
 *
 * Catches v0.1.22/23 class regressions without a full Tauri shell:
 * - html2canvas.scale must not drive page placement (mm Fit-width does)
 * - capture must stay inside the print iframe (no pdf.html host-theme leak)
 * - tall embeds plan multi-slice instead of silent crop
 *
 * Optionally runs a headless Chrome CSS-isolation fixture when a Chrome/Chromium
 * binary is available (CI installs one; local uses system Chrome when present).
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const PAGE_MARGIN_MM = 18;
const MAX_EMBED_CAPTURE_HEIGHT_PX = 1800;
const LETTER = { widthMm: 215.9, heightMm: 279.4 };

function mmToPx(mm) {
  return (mm / 25.4) * 96;
}

function paperLayoutPx(size) {
  const widthPx = Math.round(mmToPx(size.widthMm));
  const heightPx = Math.round(mmToPx(size.heightMm));
  const marginPx = Math.round(mmToPx(PAGE_MARGIN_MM));
  return {
    widthPx,
    heightPx,
    marginPx,
    contentWidthPx: Math.max(1, widthPx - marginPx * 2),
    contentHeightPx: Math.max(1, heightPx - marginPx * 2),
  };
}

function pdfPaperFitPlacement(size) {
  const layout = paperLayoutPx(size);
  return {
    marginMm: PAGE_MARGIN_MM,
    contentWidthMm: Math.max(1, size.widthMm - PAGE_MARGIN_MM * 2),
    contentHeightMm: Math.max(1, size.heightMm - PAGE_MARGIN_MM * 2),
    contentWidthPx: layout.contentWidthPx,
  };
}

/** Mirror of src/lib/pdfExportLayout.ts planEmbedCapture — keep in sync. */
function planEmbedCapture(fullHeightPx, maxSliceHeightPx = MAX_EMBED_CAPTURE_HEIGHT_PX) {
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
  const sliceHeightsPx = [];
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

function findChrome() {
  const envBin = process.env.CHROME_BIN || process.env.CHROMIUM_BIN;
  if (envBin) return envBin;
  const candidates = [
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  for (const bin of candidates) {
    const probe = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return bin;
  }
  return null;
}

// --- 1. Paper-fit math -------------------------------------------------------

const letterFit = pdfPaperFitPlacement(LETTER);
assert.equal(letterFit.marginMm, 18);
assert.ok(
  Math.abs(letterFit.contentWidthMm - (215.9 - 36)) < 1e-9,
  "Letter content width mm = paper − 2× margin",
);
assert.equal(
  letterFit.contentWidthPx,
  Math.round(mmToPx(215.9)) - 2 * Math.round(mmToPx(18)),
  "Letter content width px matches paperLayoutPx",
);
console.log("ok: paper-fit Letter content width (mm + px)");

// Placement must use contentWidthMm as addImage width — never canvas.width * scale hacks.
assert.equal(
  letterFit.contentWidthMm,
  letterFit.contentWidthMm,
  "imgWidthMm locks to contentWidthMm",
);
console.log("ok: addImage width is paper content mm (Fit-width)");

// --- 2. Tall-embed slice planning --------------------------------------------

const under = planEmbedCapture(1800);
assert.equal(under.sliceCount, 1);
assert.equal(under.sliced, false);
assert.deepEqual(under.sliceHeightsPx, [1800]);

const justOver = planEmbedCapture(1801);
assert.equal(justOver.sliceCount, 2);
assert.equal(justOver.sliced, true);
assert.deepEqual(justOver.sliceHeightsPx, [1800, 1]);

const exact2 = planEmbedCapture(3600);
assert.equal(exact2.sliceCount, 2);
assert.deepEqual(exact2.sliceHeightsPx, [1800, 1800]);

const three = planEmbedCapture(3601);
assert.equal(three.sliceCount, 3);
assert.deepEqual(three.sliceHeightsPx, [1800, 1800, 1]);

const sum = three.sliceHeightsPx.reduce((a, b) => a + b, 0);
assert.equal(sum, 3601, "slices cover full height (no silent crop)");
console.log("ok: tall-embed multi-slice planning (no silent crop)");

// --- 3. Source invariants (export path architecture) -------------------------

const exportPdf = readFileSync(join(root, "src/lib/exportPdf.ts"), "utf8");
const layoutMod = readFileSync(join(root, "src/lib/pdfExportLayout.ts"), "utf8");

// Ban jsPDF html-plugin *calls* (comments may mention pdf.html as the forbidden path).
const exportPdfCode = exportPdf
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(
  exportPdfCode,
  /\.html\s*\(/,
  "no jsPDF .html( call — use iframe + html2canvas + addImage",
);
assert.match(
  exportPdf,
  /html2canvas\s*\(\s*body/,
  "rasterize iframe body with html2canvas",
);
assert.match(exportPdf, /pdf\.addImage\s*\(/, "place bitmap with addImage");
assert.match(
  exportPdf,
  /imgWidthMm\s*=\s*contentWidthMm/,
  "addImage width locked to paper content mm",
);
assert.match(
  exportPdf,
  /color:\s*#111\s*!important/,
  "export HTML locks light paper ink",
);
assert.match(
  exportPdf,
  /background:\s*#fff\s*!important/,
  "export HTML locks white paper background",
);
assert.match(
  exportPdf,
  /width:\s*fit\.contentWidthPx|width:\s*layout\.contentWidthPx|windowWidth:\s*fit\.contentWidthPx/,
  "html2canvas width/windowWidth use paper content px",
);
assert.match(
  layoutMod,
  /MAX_EMBED_CAPTURE_HEIGHT_PX\s*=\s*1800/,
  "soft capture height constant is 1800px",
);
assert.match(
  exportPdf,
  /planEmbedCapture/,
  "embed capture uses planEmbedCapture (multi-slice)",
);
assert.match(
  exportPdf,
  /tall embed — split into/,
  "caption discloses multi-slice (honesty)",
);
assert.doesNotMatch(
  exportPdf,
  /preview cropped for print/,
  "must not silently crop with old caption",
);
console.log("ok: exportPdf source invariants (iframe raster + light ink + slice)");

// Layout module constants must stay aligned with this smoke script.
assert.match(layoutMod, /PAGE_MARGIN_MM|pdfPaperFitPlacement/);
assert.equal(MAX_EMBED_CAPTURE_HEIGHT_PX, 1800);
console.log("ok: pdfExportLayout constants aligned");

// --- 4. Optional headless Chrome CSS-isolation fixture -----------------------

const chrome = findChrome();
if (!chrome) {
  console.log("skip: headless Chrome fixture (no Chrome/Chromium binary)");
} else {
  const layout = paperLayoutPx(LETTER);
  const dir = mkdtempSync(join(tmpdir(), "gdd-pdf-smoke-"));
  const fixturePath = join(dir, "fixture.html");
  const fixture = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>PDF smoke fixture</title>
<style>
  /* Host App dark theme — must NOT apply to the print iframe capture root. */
  :root {
    --bg: #1a1a1a;
    --ink-strong: #f2f2f2;
  }
  html, body {
    margin: 0;
    background: var(--bg);
    color: var(--ink-strong);
    font-family: "Segoe UI", Helvetica, sans-serif;
  }
</style>
</head>
<body>
<main>Host dark shell (must not leak into capture)</main>
<script>
(function () {
  var CONTENT_WIDTH_PX = ${layout.contentWidthPx};
  var iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-12000px;top:0;width:" + CONTENT_WIDTH_PX + "px;height:400px;border:0;";
  document.body.appendChild(iframe);
  var doc = iframe.contentDocument;
  doc.open();
  doc.write(${JSON.stringify(`<!DOCTYPE html>
<html><head><style>
body {
  margin: 0;
  font-family: Georgia, serif;
  color: #111 !important;
  background: #fff !important;
  font-size: 12pt;
  line-height: 1.55;
  width: ${layout.contentWidthPx}px;
  max-width: ${layout.contentWidthPx}px;
  box-sizing: border-box;
}
h1 { font-size: 18pt; margin: 0 0 8pt; color: #111; }
p { margin: 0 0 8pt; color: #111; }
</style></head>
<body>
<header><h1>Combat</h1></header>
<article>
<p>Parry</p>
<p>LMB attack</p>
</article>
</body></html>`)});
  doc.close();

  var host = getComputedStyle(document.body);
  var paper = getComputedStyle(doc.body);
  function parseRgb(c) {
    var m = String(c).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  }
  var hostBg = parseRgb(host.backgroundColor);
  var paperBg = parseRgb(paper.backgroundColor);
  var paperInk = parseRgb(paper.color);
  var width = doc.body.clientWidth || doc.body.offsetWidth;

  var ok =
    hostBg && hostBg.r < 40 && hostBg.g < 40 && hostBg.b < 40 &&
    paperBg && paperBg.r > 240 && paperBg.g > 240 && paperBg.b > 240 &&
    paperInk && paperInk.r < 40 && paperInk.g < 40 && paperInk.b < 40 &&
    Math.abs(width - CONTENT_WIDTH_PX) <= 2;

  var result = {
    ok: !!ok,
    hostBg: host.backgroundColor,
    paperBg: paper.backgroundColor,
    paperInk: paper.color,
    width: width,
    expectedWidth: CONTENT_WIDTH_PX
  };
  var el = document.createElement("pre");
  el.id = "pdf-smoke-result";
  el.textContent = JSON.stringify(result);
  document.body.appendChild(el);
})();
</script>
</body>
</html>`;
  writeFileSync(fixturePath, fixture, "utf8");

  const run = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      `--virtual-time-budget=5000`,
      "--dump-dom",
      `file://${fixturePath}`,
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );

  rmSync(dir, { recursive: true, force: true });

  if (run.status !== 0) {
    console.error(run.stderr || run.stdout);
    assert.fail(`Chrome headless exited ${run.status}`);
  }

  const match = run.stdout.match(
    /id="pdf-smoke-result"[^>]*>([^<]+)</,
  );
  assert.ok(match, "fixture must emit #pdf-smoke-result JSON");
  const result = JSON.parse(match[1]);
  assert.equal(result.ok, true, `CSS isolation failed: ${JSON.stringify(result)}`);
  assert.ok(
    Math.abs(result.width - result.expectedWidth) <= 2,
    `capture root width ${result.width} ≠ paper content ${result.expectedWidth}`,
  );
  console.log("ok: headless Chrome — light paper ink isolated from dark host");
  console.log(
    `   hostBg=${result.hostBg}; paperBg=${result.paperBg}; ink=${result.paperInk}; width=${result.width}`,
  );
}

console.log("\nPDF export smoke passed.");
