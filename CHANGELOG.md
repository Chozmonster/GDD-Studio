# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Mood Board crop now shows the selected region in live document embeds (and board tiles). Offsets use frame-relative `left`/`top` instead of self-relative `transform` percentages, which previously scrolled non-top-left crops out of view.

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

[Unreleased]: https://github.com/Chozmonster/GDD-Studio/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.1
[0.1.0]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.0
