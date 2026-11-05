/**
 * Quick verification of Mood Board crop offset math (no test runner).
 * Run: node scripts/verify-mood-crop-style.mjs
 *
 * Asserts that left/top (parent-relative) place the crop rect at the frame
 * origin, and that the old transform(%) formula over-shifts non-origin crops.
 */

function styleFor(crop) {
  const scaleX = 1 / crop.width;
  const scaleY = 1 / crop.height;
  return {
    leftPct: (-crop.x / crop.width) * 100,
    topPct: (-crop.y / crop.height) * 100,
    widthPct: scaleX * 100,
    heightPct: scaleY * 100,
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

for (const [name, crop] of [
  ["bottom-left", bottomLeft],
  ["top-left", topLeft],
  ["mid", mid],
]) {
  const v = visibleOrigin(crop);
  assert(approx(v.x, crop.x), `${name}: visible x matches crop.x (${v.x} ≈ ${crop.x})`);
  assert(approx(v.y, crop.y), `${name}: visible y matches crop.y (${v.y} ≈ ${crop.y})`);
  assert(approx(v.shownW, crop.width), `${name}: shown width matches`);
  assert(approx(v.shownH, crop.height), `${name}: shown height matches`);
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

if (process.exitCode) {
  console.error("\nverify-mood-crop-style: FAILED");
} else {
  console.log("\nverify-mood-crop-style: PASSED");
}
