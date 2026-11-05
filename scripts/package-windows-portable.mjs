#!/usr/bin/env node
/**
 * Pack a Windows portable .zip from a Tauri release build.
 *
 * Ships the release exe + sibling DLLs + resources/ (same payload an
 * NSIS/MSI install would place on disk). No installer required — unzip
 * and run gdd-studio.exe.
 *
 * Usage (after `npm run tauri build` or `npm run build:portable`):
 *   node scripts/package-windows-portable.mjs
 *   node scripts/package-windows-portable.mjs --release-dir path/to/release
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const PRODUCT_SLUG = "gdd-studio";
const EXE_CANDIDATES = ["gdd-studio.exe", "GDD Studio.exe"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readVersion() {
  const conf = readJson(join(projectRoot, "src-tauri", "tauri.conf.json"));
  if (conf.version) return String(conf.version);
  const pkg = readJson(join(projectRoot, "package.json"));
  return String(pkg.version ?? "0.0.0");
}

function parseArgs(argv) {
  const out = { releaseDir: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--release-dir" && argv[i + 1]) {
      out.releaseDir = resolve(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/package-windows-portable.mjs [--release-dir <dir>]",
      );
      process.exit(0);
    }
  }
  return out;
}

function detectReleaseDir(explicit) {
  if (explicit) return explicit;

  const candidates = [
    join(projectRoot, "src-tauri", "target", "release"),
    join(
      projectRoot,
      "src-tauri",
      "target",
      "x86_64-pc-windows-msvc",
      "release",
    ),
    join(
      projectRoot,
      "src-tauri",
      "target",
      "aarch64-pc-windows-msvc",
      "release",
    ),
  ];

  for (const dir of candidates) {
    if (EXE_CANDIDATES.some((name) => existsSync(join(dir, name)))) {
      return dir;
    }
  }

  return candidates[0];
}

function detectArch(releaseDir) {
  const normalized = releaseDir.replace(/\\/g, "/");
  if (normalized.includes("aarch64-pc-windows")) return "arm64";
  if (process.arch === "arm64") return "arm64";
  return "x64";
}

function findExe(releaseDir) {
  for (const name of EXE_CANDIDATES) {
    const path = join(releaseDir, name);
    if (existsSync(path)) return { path, name };
  }
  return null;
}

function portableReadme(version) {
  return `GDD Studio ${version} — Windows portable
==========================================

Unzip this folder anywhere and run gdd-studio.exe.
No installer, no admin rights, no MSI/NSIS required.

Requirements
------------
- Windows 10 (April 2018+) or Windows 11
- Microsoft Edge WebView2 Runtime (usually preinstalled).
  If the window stays blank, install from:
  https://developer.microsoft.com/microsoft-edge/webview2/

Notes
-----
- Keep gdd-studio.exe next to any .dll files and the resources/ folder
  from this zip. Do not move the exe alone.
- Builds made with \`npm run build:portable\` store launcher settings in
  an \`app-data/\` folder beside the exe (created on first run).
- Project files still live where you create them (default suggestion:
  Documents/GDD Studio Projects).
- SmartScreen may warn on first launch of an unsigned build — choose
  "More info" → "Run anyway".
- To upgrade a portable install: quit the app, replace this folder with
  a newer portable zip (preserve app-data/ if you want settings kept).

Optional installers (NSIS setup.exe / MSI) may also be produced by
\`npm run tauri build\` under src-tauri/target/release/bundle/ — they are
extras, not the primary distribution path.
`;
}

function resolvePython() {
  for (const bin of ["python3", "python", "py"]) {
    try {
      if (bin === "py") {
        execFileSync(bin, ["-3", "--version"], { stdio: "ignore" });
      } else {
        execFileSync(bin, ["--version"], { stdio: "ignore" });
      }
      return bin;
    } catch {
      // try next
    }
  }
  throw new Error(
    "Python 3 is required to create the portable zip (python3/python/py not found).",
  );
}

function zipWithPython(stagingApp, zipPath) {
  const python = resolvePython();
  const script = `
import pathlib, zipfile, sys
root = pathlib.Path(sys.argv[1])
zip_path = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(root.parent).as_posix())
`;
  const args =
    python === "py"
      ? ["-3", "-c", script, stagingApp, zipPath]
      : ["-c", script, stagingApp, zipPath];
  execFileSync(python, args, { stdio: "inherit" });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const releaseDir = detectReleaseDir(args.releaseDir);
  const exe = findExe(releaseDir);

  if (!exe) {
    console.error(
      `Release binary not found under ${releaseDir}.\n` +
        `Run \`npm run tauri build\` or \`npm run build:portable\` first.`,
    );
    process.exit(1);
  }

  const version = readVersion();
  const arch = detectArch(releaseDir);
  const zipBase = `${PRODUCT_SLUG}-v${version}-windows-${arch}-portable`;
  const portableRoot = join(releaseDir, "bundle", "portable");
  const stagingRoot = join(portableRoot, ".staging");
  const stagingApp = join(stagingRoot, zipBase);
  const zipPath = join(portableRoot, `${zipBase}.zip`);

  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingApp, { recursive: true });

  // Friendly stable name inside the zip.
  cpSync(exe.path, join(stagingApp, "gdd-studio.exe"));

  for (const sibling of readdirSync(releaseDir)) {
    if (/\.dll$/i.test(sibling)) {
      cpSync(join(releaseDir, sibling), join(stagingApp, sibling));
    }
  }

  const resourcesDir = join(releaseDir, "resources");
  if (existsSync(resourcesDir)) {
    cpSync(resourcesDir, join(stagingApp, "resources"), { recursive: true });
  }

  writeFileSync(
    join(stagingApp, "README-portable.txt"),
    portableReadme(version),
    "utf8",
  );

  mkdirSync(portableRoot, { recursive: true });
  rmSync(zipPath, { force: true });
  zipWithPython(stagingApp, zipPath);
  rmSync(stagingRoot, { recursive: true, force: true });

  console.log(`Portable package: ${zipPath}`);
  console.log("Distribute that zip. Users unzip and run gdd-studio.exe.");
}

main();
