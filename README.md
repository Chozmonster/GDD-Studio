# GDD Studio

Standalone desktop app for writing and maintaining game design documents. Local-first; built with **Tauri 2**, **Rust**, **Vite**, **React**, **TypeScript**, and **TipTap**.

Current cut (as of **v0.1.24+**): **Godot-style project launcher**, TipTap rich editor (**multi-document projects**, **cross-doc wiki links** `[[Doc Title]]`, **project-wide plain-text variables** `{{name}}`, **media embeds**, **spellcheck/lookup**, **templates**, **PDF export** via save dialog to `exports/`), **Flowcharts**, **RGD**, **Mood Board**, **Graph** (UI name; disk `charts/`), **Whiteboard** (disk `whiteboards/`), Print view zoom, and expanded in-app Help. **In-app cloud OAuth sync is canceled** — use Options → **Open project folder** for DIY backup instead.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (npm or pnpm)
- [Rust](https://rustup.rs/) stable (1.90+)
- OS-specific Tauri dependencies: [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Quick start

```bash
npm install
npm run tauri dev
```

Frontend-only preview (persists demo library in `localStorage`):

```bash
npm run dev
# Demo update banner / patch notes:
VITE_GDD_SIMULATE_UPDATE=1 npm run dev
```

Native simulate flag (Tauri):

```bash
GDD_STUDIO_SIMULATE_UPDATE=1 npm run tauri dev
```

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production frontend → `dist/` |
| `npm run tauri build` | Package desktop app (NSIS/MSI extras + release exe) |
| `npm run build:portable` | **Primary ship path** — portable Windows zip (exe + deps) |
| `npm run package:portable` | Zip an existing release build into the portable artifact |
| `cargo check` (in `src-tauri/`) | Rust compile check |

### Portable Windows distribution (preferred)

Prefer an installer-free zip over MSI/NSIS. On a Windows build machine:

```bash
npm run build:portable
```

Artifact to distribute (version matches `package.json` / release tag):

`src-tauri/target/release/bundle/portable/gdd-studio-v*-windows-x64-portable.zip`

Users unzip anywhere and run `gdd-studio.exe`. NSIS (current-user) and MSI from `npm run tauri build` remain optional extras under `src-tauri/target/release/bundle/`. Details: Project doc `docs/portable-packaging.md`.

## Project layout

```
├── src/                      # React UI
│   ├── components/
│   │   ├── Launcher.tsx      # Godot-like project manager
│   │   ├── OptionsPanel.tsx  # Options window / modal
│   │   ├── EditorShell.tsx   # Document / Flowcharts / RGD / Mood Board / Graph / Whiteboard
│   │   ├── EditorCanvas.tsx  # TipTap
│   │   ├── flowchart/        # @xyflow: typed shapes, colors, resize, edge styles
│   │   ├── charts/           # Graph MVP (table + line/bar + formula; disk: charts/)
│   │   └── whiteboard/       # Whiteboard doodle MVP (disk: whiteboards/)
│   └── api.ts
├── src-tauri/
│   ├── src/store.rs          # Project library, settings, tool JSON payloads
│   ├── src/updates.rs        # Updater check / install / daily gate
│   └── tauri.conf.json       # productName + updater endpoints
└── .github/workflows/ci.yml
```

Flowcharts save under `{project}/flowcharts/*.json`; Graph (UI) under `{project}/charts/*.json`; Whiteboard under `{project}/whiteboards/*.json` (browser preview uses `localStorage`).

## Automatic updates (GitHub Releases)

Configured in `src-tauri/tauri.conf.json`:

- **Endpoint:** `https://github.com/Chozmonster/GDD-Studio/releases/latest/download/latest.json`
- **Pubkey:** minisign public key embedded under `plugins.updater.pubkey`
- **Artifacts:** `bundle.createUpdaterArtifacts: true`

**To ship real updates:**

1. Keep the matching **minisign private key** secret (CI secret `TAURI_SIGNING_PRIVATE_KEY`, optional password `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
2. Build/publish with [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) so each GitHub Release includes the **portable zip** (primary), optional signed NSIS/MSI extras, **and** `latest.json`.
3. Keep `CHANGELOG.md` updated; the release workflow copies that version’s section into the GitHub Release body (and thus `latest.json` `notes`).
4. Release body text is shown as patch notes in Options / the launcher update banner.

Until releases exist, update checks fail softly (UI stays usable). Use `GDD_STUDIO_SIMULATE_UPDATE=1` / `VITE_GDD_SIMULATE_UPDATE=1` to demo the notify + Install + patch notes flow.

**Behavior:**

- **Auto on:** about once per day (`lastUpdateCheckAt`); if an update exists, download/install automatically.
- **Auto off:** same daily check; launcher shows a banner with **Install** + **View patch notes**.
- Manual **Check for updates** in Options always forces a network check (does **not** auto-download).
- Separate **Download / Install** is enabled only when an update is available.
- **View patch notes** shows the updater body / cached notes, and falls back to `latest.json` notes from GitHub.

## Scope notes

Honest cut vs early scaffolding claims — matches shipped **v0.1.24+** (no version bump in this docs pass).

**Shipped:**

- Launcher: create / open / remove from the project library (disk folder is not wiped on remove)
- Multi-document projects; nested heading map (H1→H2→H3); project documents list; cross-doc wiki links `[[Doc Title]]` (section links deprioritized — doc map covers in-doc jump)
- Project-wide **plain-text** variables `{{name}}` (no type dropdown)
- TipTap rich editor, media embeds (image/gif/video/audio), spellcheck/lookup, templates
- **PDF export**: real `.pdf` via native save dialog; default `<project>/exports/<document-title>.pdf` (creates `exports/` if missing); tool embeds captured as screenshots
- Design libraries with live doc embeds: Flowcharts, RGD sheets, Mood Board, **Graph** (UI; files under `charts/`), Whiteboard
- Print view magnification: Fit width / Fit page / 10%–100%
- Expanded Help: product intro, per-tab control guides, indented left map (RGD stays one scrollable page)
- Options: paper size, variable-name display, updater controls, **Open project folder** (DIY backup)
- Portable Windows zip primary distribution + GitHub Releases updater

**Not shipped / canceled / deferred:**

- **In-app cloud OAuth sync** (Drive / OneDrive / Dropbox) — **canceled**; DIY via **Open project folder**
- Hosted share links (view/edit) — deferred while free/portable/local-first stays primary
- Machinations-style economy simulation — out of scope
- Wiki **backlinks** UI (list API leftover only; no panel)
- Deleting the on-disk project folder when removing a library entry
- Full flowchart edit-speed kit (clipboard / align-distribute / quick-add / context menu) — polish still open
