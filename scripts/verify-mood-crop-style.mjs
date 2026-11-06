/**
 * Quick verification of Mood Board crop offset + aspect math (no test runner).
 * Run: node scripts/verify-mood-crop-style.mjs
 *
 * Asserts that left/top (parent-relative) place the crop rect at the frame
 * origin, that the display frame aspect matches the selection (no stretch),
 * and that the old transform(%) formula over-shifts non-origin crops.
 */

const STAGE_ASPECT = 4 / 3;

function styleFor(crop) {
  const scaleX = 1 / crop.width;
  const scaleY = 1 / crop.height;
  return {
    leftPct: (-crop.x / crop.width) * 100,
    topPct: (-crop.y / crop.height) * 100,
    widthPct: scaleX * 100,
    heightPct: scaleY * 100,
    displayAspect: (crop.width / crop.height) * STAGE_ASPECT,
  };
}

/** Visible natural-space origin after applying left/top % of the frame. */
function visibleOrigin(crop, frameW = 100, frameH = 100) {
  const s = styleFor(crop);
  const imgW = (s.widthPct / 100) * frameW;
  const imgH = (s.heightPct / 100) * frameH;
  const leftPx = (s.leftPct / 100) * frameW;
  const topPx = (s.topPct / 100) * frameH;
  return {
    x: -leftPx / imgW,
    y: -topPx / imgH,
    shownW: frameW / imgW,
    shownH: frameH / imgH,
  };
}

/**
 * Content stretch factor when mapping crop into a frame of the given aspect.
 * 1 = no distortion. Independent X/Y scale into a mismatched frame stretches.
 */
function contentStretch(crop, frameAspect) {
  // Image fills a STAGE_ASPECT box; crop region aspect within that box:
  const cropAspect = (crop.width / crop.height) * STAGE_ASPECT;
  // object-fit:fill into frameAspect stretches by frameAspect/cropAspect on X vs Y
  return frameAspect / cropAspect;
}

/** Buggy transform(%) path previously used in cropImageStyle. */
function buggyVisibleOrigin(crop, frameW = 100, frameH = 100) {
  const imgW = frameW / crop.width;
  const imgH = frameH / crop.height;
  // translate((-x/width)*100%, ...) — % of the element, not the frame
  const tx = ((-crop.x / crop.width) / 100) * 100 * imgW;
  const ty = ((-crop.y / crop.height) / 100) * 100 * imgH;
  return {
    x: -tx / imgW,
    y: -ty / imgH,
  };
}

function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

const bottomLeft = { x: 0.05, y: 0.55, width: 0.4, height: 0.35 };
const topLeft = { x: 0, y: 0, width: 0.4, height: 0.35 };
const mid = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
const wideBanner = { x: 0.05, y: 0.08, width: 0.55, height: 0.18 };

for (const [name, crop] of [
  ["bottom-left", bottomLeft],
  ["top-left", topLeft],
  ["mid", mid],
  ["wide-banner", wideBanner],
]) {
  const v = visibleOrigin(crop);
  assert(approx(v.x, crop.x), `${name}: visible x matches crop.x (${v.x} ≈ ${crop.x})`);
  assert(approx(v.y, crop.y), `${name}: visible y matches crop.y (${v.y} ≈ ${crop.y})`);
  assert(approx(v.shownW, crop.width), `${name}: shown width matches`);
  assert(approx(v.shownH, crop.height), `${name}: shown height matches`);

  const s = styleFor(crop);
  assert(
    approx(s.displayAspect, (crop.width / crop.height) * STAGE_ASPECT),
    `${name}: display aspect = (w/h)*(4/3) (${s.displayAspect})`,
  );
  assert(
    approx(contentStretch(crop, s.displayAspect), 1),
    `${name}: no stretch when frame matches crop aspect`,
  );
  assert(
    !approx(contentStretch(crop, STAGE_ASPECT), 1, 1e-3) ||
      approx(crop.width / crop.height, 1, 1e-3),
    `${name}: forcing full 4/3 frame would stretch non-square crops (legacy bug)`,
  );
}

const buggy = buggyVisibleOrigin(bottomLeft);
assert(
  !approx(buggy.y, bottomLeft.y),
  `legacy transform(%) over-shifts y (${buggy.y} ≠ ${bottomLeft.y})`,
);
assert(
  approx(buggy.y, bottomLeft.y / bottomLeft.height),
  `legacy transform(%) y is y/height (${buggy.y})`,
);

const wideStretchLegacy = contentStretch(wideBanner, STAGE_ASPECT);
assert(
  wideStretchLegacy < 0.5,
  `wide banner into 4/3 stretches vertically (legacy factor ${wideStretchLegacy})`,
);

if (process.exitCode) {
  console.error("\nverify-mood-crop-style: FAILED");
} else {
  console.log("\nverify-mood-crop-style: PASSED");
}
