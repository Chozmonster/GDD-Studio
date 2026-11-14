/**
 * Mood palette naming / disambiguation smoke.
 * Run: node scripts/verify-whiteboard-palette-options.mjs
 */

function disambiguate(options) {
  const nameCounts = new Map();
  for (const opt of options) {
    nameCounts.set(opt.name, (nameCounts.get(opt.name) ?? 0) + 1);
  }
  const nameSeen = new Map();
  for (const opt of options) {
    const total = nameCounts.get(opt.name) ?? 1;
    if (total <= 1) continue;
    const n = (nameSeen.get(opt.name) ?? 0) + 1;
    nameSeen.set(opt.name, n);
    const tip = opt.hexes[0] ?? `#${n}`;
    opt.name = `${opt.name} · ${tip}`;
  }
  return options;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const single = disambiguate([
  { name: "Refs", hexes: ["#111111", "#222222"], key: "a" },
]);
assert(single[0].name === "Refs", "single keeps board name");

const multi = disambiguate([
  { name: "Refs", hexes: ["#AA0000"], key: "a" },
  { name: "Refs", hexes: ["#00BB00"], key: "b" },
]);
assert(multi[0].name === "Refs · #AA0000", "first disambiguated");
assert(multi[1].name === "Refs · #00BB00", "second disambiguated");

console.log("verify-whiteboard-palette-options: ok");
