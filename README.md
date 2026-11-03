# GDD Studio

Standalone desktop app for writing and maintaining game design documents. Local-first; built with **Tauri 2**, **Rust**, **Vite**, **React**, **TypeScript**, and **TipTap**.

This repository currently contains the **scaffold only** — app chrome, a placeholder project library, a TipTap editor canvas, and stubbed Rust IPC. Full v1 features (persistence, variables, wiki links, assets, spellcheck, PDF export) are not implemented yet.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (npm or pnpm)
- [Rust](https://rustup.rs/) stable (Cargo)
- OS-specific Tauri dependencies: see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

| Platform | Notes |
|----------|--------|
| Linux | `webkit2gtk`, `librsvg2`, GTK 3 development packages |
| macOS | Xcode Command Line Tools |
| Windows | Microsoft Visual Studio C++ Build Tools, WebView2 |

## Quick start

```bash
# Install JS dependencies
npm install
# or: pnpm install

# Run the desktop app (starts Vite + Rust/Tauri)
npm run tauri dev
# or: pnpm tauri dev
```

Frontend-only preview (no native window; mirrors Rust stub data in-browser):

```bash
npm run dev
```

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run build` | Production frontend build → `dist/` |
| `npm run tauri build` | Package the desktop app (platform-specific) |
| `cargo check` (in `src-tauri/`) | Rust compile check without full bundle |

## Repository layout

```
├── src/                 # React + TipTap UI
│   ├── components/      # Project library + editor canvas
│   ├── api.ts           # Thin wrappers around Tauri invoke
│   └── App.tsx          # App chrome / workspace shell
├── src-tauri/           # Rust core + Tauri config
│   ├── src/commands.rs  # IPC stubs (health / list / open)
│   └── tauri.conf.json  # productName: "GDD Studio"
├── .github/workflows/   # CI: typecheck + frontend build + cargo check
└── package.json
```

## Scope notes

**In this scaffold:** runnable desktop shell, TipTap starter editor, stub commands for health and project open.

**Not yet (by design):** cloud sync, share links, PDF export, variables, wiki links, asset pipeline, spellcheck. Extension points / TODOs live in `src-tauri/src/lib.rs` and `commands.rs`.
