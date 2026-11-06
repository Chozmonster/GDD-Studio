# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-11-06

Flowchart Miro multi-select, nested document map, Open project folder, and Options update/resize fixes.

### Added

- Flowchart canvas Miro-like multi-select: left-drag on empty pane marquees intersecting nodes and connectors; click selects; Shift+click adds/toggles; drag moves the selection; click empty clears; Space+drag or middle-mouse pans (scroll/pinch zoom). Type / shape / color / connector style tools apply to all selected items.
- Options → **Open project folder** reveals the current project’s root directory in the OS file manager (Explorer / Finder / xdg). Same action on the launcher for the selected project. Copy the folder yourself for backup (Dropbox, Drive, USB, etc.).

### Changed

- Document map nests headings by level (H1 → H2 → H3) with visual indent instead of a flat list; click-to-scroll and live updates are unchanged.
- Options **Check for updates** only queries status / available version / patch notes; it no longer downloads or installs. A separate **Download / Install update** button is enabled only when an update is available. The Automatic updates toggle still drives the daily/background install path.
- Options window is user-resizable, and its size/position restore from `window-geometry` prefs across close/reopen (same pattern as launcher/editor).

### Notes

- In-app cloud sync / OAuth (Drive MVP) was not shipped; portable DIY folder backup is the intended path.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.4] - 2026-11-06

Mood Board crop keeps the selection’s aspect ratio in tiles and live document embeds.

### Fixed

- Mood Board crop no longer stretches the selection to fill the original 4:3 tile/embed frame. The display frame resizes to the crop’s aspect ratio so board tiles and live document embeds stay undistorted.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.3] - 2026-11-05

Code cleanup sweep: dead code removal, shared embed resize, clarifying invariants. No user-facing behavior change.

### Changed

- Internal code cleanup: removed unused frontend helpers/exports, shared embed resize logic, light Mood Board embed fetch dedupe, and clarifying comments (crop math, live embeds, security allowlists). No user-facing behavior change.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.2] - 2026-11-05

Mood Board crop fix for live document embeds.

### Fixed

- Mood Board crop now shows the selected region in live document embeds (and board tiles). Offsets use frame-relative `left`/`top` instead of self-relative `transform` percentages, which previously scrolled non-top-left crops out of view.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.1] - 2026-11-05

Patch-notes practice cut: release bodies now feed the in-app updater UI.

### Added

- Root `CHANGELOG.md` (Keep a Changelog) as the source of truth for release notes
- Release workflow extracts the tagged version’s CHANGELOG section into the GitHub Release body (also written into `latest.json` `notes` for the Tauri updater)
- Options / launcher **View patch notes** falls back to the latest release notes from GitHub when the local update cache is empty

### Changed

- Version bump to `0.1.1` across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.0] - 2026-11-05

First signed public cut of GDD Studio (v1 merge / release on `main`).

### Added

- Godot-style project launcher (create / open / remove local projects)
- Options window with automatic-updates toggle and manual check
- TipTap editor shell with multi-document projects, wiki links, variables, media embeds, spellcheck/lookup, templates, and PDF export
- Flowchart editor, Mood Board, and RGD workspace
- Portable Windows zip packaging (primary distribution) plus optional NSIS/MSI
- Tauri updater wired to GitHub Releases (`latest.json` + minisign); signing pubkey rotated to match Actions secret

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

[Unreleased]: https://github.com/Chozmonster/GDD-Studio/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.3
[0.1.2]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.2
[0.1.1]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.1
[0.1.0]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.0
