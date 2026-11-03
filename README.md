# GDD Studio

Standalone desktop app for writing and maintaining game design documents. Local-first; built with **Tauri 2**, **Rust**, **Vite**, **React**, **TypeScript**, and **TipTap**.

Current cut: **Godot-style project launcher**, TipTap document shell, **basic flowchart editor** (React Flow / `@xyflow`), and Options (automatic updates). Full GDD features (variables, wiki links, assets, spellcheck, PDF) are not implemented yet. Cloud sync / share links remain v1.5+.

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
| `npm run tauri build` | Package desktop app |
| `cargo check` (in `src-tauri/`) | Rust compile check |

## Project layout

```
├── src/                      # React UI
│   ├── components/
│   │   ├── Launcher.tsx      # Godot-like project manager
│   │   ├── OptionsPanel.tsx  # Options window / modal
│   │   ├── EditorShell.tsx   # Document / Flowcharts tabs
│   │   ├── EditorCanvas.tsx  # TipTap
│   │   └── flowchart/        # @xyflow: typed shapes, colors, resize, edge styles
│   └── api.ts
├── src-tauri/
│   ├── src/store.rs          # Project library, settings, flowchart JSON
│   ├── src/updates.rs        # Updater check / install / daily gate
│   └── tauri.conf.json       # productName + updater endpoints
└── .github/workflows/ci.yml
```

Flowcharts save under `{project}/flowcharts/main.json` (browser preview uses `localStorage`).

## Automatic updates (GitHub Releases)

Configured in `src-tauri/tauri.conf.json`:

- **Endpoint:** `https://github.com/Chozmonster/GDD-Studio/releases/latest/download/latest.json`
- **Pubkey:** minisign public key embedded under `plugins.updater.pubkey`
- **Artifacts:** `bundle.createUpdaterArtifacts: true`

**To ship real updates:**

1. Keep the matching **minisign private key** secret (CI secret `TAURI_SIGNING_PRIVATE_KEY`, optional password `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
2. Build/publish with [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) so each GitHub Release includes signed installers **and** `latest.json`.
3. Release body text is shown as patch notes in the app.

Until releases exist, update checks fail softly (UI stays usable). Use `GDD_STUDIO_SIMULATE_UPDATE=1` / `VITE_GDD_SIMULATE_UPDATE=1` to demo the notify + Install + patch notes flow.

**Behavior:**

- **Auto on:** about once per day (`lastUpdateCheckAt`); if an update exists, download/install automatically.
- **Auto off:** same daily check; launcher shows a banner with **Install** + **View patch notes**.
- Manual **Check for updates** in Options always forces a network check.

## Scope notes

**In:** launcher (create / open / remove), local project metadata persistence, Options window, updater wiring, TipTap editor shell, back-to-launcher navigation.

**Not yet:** cloud sync, share links, PDF export, variables, wiki links, asset pipeline, spellcheck, deleting project files on disk.
