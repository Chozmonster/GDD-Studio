# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Whiteboard **layers** panel moved to the **right** of the canvas so drawing tools stay in one horizontal toolbar row.
- Whiteboard size controls use clear labels: **Brush size** (stroke width) and **Text size** (font), with context emphasis when the matching tool/selection is active.

## [0.1.26] - 2026-11-13

Whiteboard drawing upgrade: layers, brushes, select/transform, canvas text, and palette picker UX (#67, #68, #70, #71, #72).

### Added

- Whiteboard **layers**: named stack with active layer for new ink, show/hide, lock, opacity, reorder, and delete (ink moves to a neighbor). Legacy boards without layers migrate to a single default layer on load. Hidden layers omit ink from embeds/PDF; Help covers the controls.
- Whiteboard **brushes**: hard / soft / highlighter styles with opacity + flow controls (pressure kept). Soft feathers edges; highlighter uses multiply alpha. Toolbar preview reflects size, colour, alpha, and style. Eraser still respects the active layer.
- Whiteboard **select & transform**: marquee and lasso (Shift adds), multi-select, move, scale/rotate handles, duplicate (Ctrl/Cmd+D), delete — skipping locked/hidden layers.
- Whiteboard **canvas text**: Type tool to place/edit text objects (font size + stroke colour), select/transform/duplicate like other ink, persists in board JSON and appears in embeds/PDF.

### Changed

- Whiteboard Mood Board palette picker shows each palette’s **name** plus a **row of colour chips**, instead of a bare dropdown of opaque labels.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.25] - 2026-11-11

Recommendation pack: docs honesty, wiki backlinks, PDF trust, project archive, flowchart edit-speed + inline edge labels, Graph layout polish.

### Added

- Document left-rail **Backlinks** under Documents — lists other docs that `[[wiki-link]]` here; click opens the linking doc.
- Options / launcher **Export project archive** — zip the current project folder via a save dialog (default `<project-name>-archive.zip` beside the project folder). DIY backup path; no cloud OAuth.
- PDF export CI smoke (`npm run test:pdf-smoke`) locks paper-fit width + light print theme so v0.1.22/23-class regressions cannot return silently.
- Tall document embeds (above ~1800px) split into multiple print images with a status warning instead of a silent crop.
- Flowchart **edit-speed** pack: clipboard copy/cut/paste, Duplicate (Ctrl/Cmd+D), align/distribute arrange chips, quick-add sibling from handle click, node/edge/pane context menus.
- Flowchart **inline edge labels** — double-click a connector (or Label placeholder) to edit on-canvas; toolbar/context Edit label uses the same field (no `window.prompt`).

### Changed

- README / Scope notes honesty pass: Current cut and Shipped vs Not shipped match v0.1.24+ (multi-doc wiki, plain-text variables, PDF → `exports/`, Graph/Whiteboard/Help; OAuth sync canceled → Open project folder / archive DIY).
- Graph tab layout polish: formula left / Preset+Type right, compact variable chips with clearer gaps, content-sized formula pane with scroll cap, preview slightly dominant and still pane-fit.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.24] - 2026-11-11

Expanded in-app Help with product intro, per-tab guides, and indented left map.

### Changed

- In-app Help expanded: Introduction chapter; per-tab control/button guides (Document, Flowcharts, RGD, Mood Board, Graph, Whiteboard, Options); indented hierarchical left map (chapters → sections → subsections) with click-to-scroll anchors. RGD remains one scrollable page.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.23] - 2026-11-11

PDF export paper-fit raster fix and larger flowchart arrowheads.

### Fixed

- PDF export rasters inside the print iframe and places the bitmap with jsPDF `addImage` at paper millimetres (fixes still-enormous export / host dark CSS leak from `pdf.html()` cloning into the editor document).
- Flowchart connector arrowheads enlarged again (28 → 48) so Start/End arrows stay visible past the green anchor dots in the editor and in document embeds (shared `FLOW_ARROW_MARKER_SIZE`).

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.22] - 2026-11-10

PDF export scale fix so paper-fit width scaling works.

### Fixed

- PDF export no longer renders content ~7.5× too large: dropped `html2canvas.scale: 2` so jsPDF paper-fit width scaling applies correctly.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.21] - 2026-11-10

Print view magnification and direct PDF export.

### Added

- Print view **magnification**: Fit width / Fit page and 10%–100% zoom (10% steps), persisted in localStorage. UI chrome only — does not affect PDF export layout.

### Changed

- **Export PDF** writes a real `.pdf` through the native save dialog (no HTML / print-dialog middle-ground). Defaults to `<project>/exports/<document-title>.pdf` and creates `exports/` when missing. Still uses Options paper size / Print-view layout; embeds stay screenshot-based.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.20] - 2026-11-10

Whiteboard eraser hit-test fixes and centered document embeds.

### Fixed

- Whiteboard **eraser** hit-testing: filled shapes honor brush radius/stroke extent, and hollow rectangles/ellipses treat their interior as hittable so shapes are no longer undeletable when the brush misses a thin stroke ring.
- Document **Whiteboard embeds** show only the fitted, centered board image (flowchart fitView spirit — no title/badge chrome; double-click opens the board). Content stays in-frame on resize.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.19] - 2026-11-10

Whiteboard pen pressure, tool icons/tooltips, and brush size preview.

### Added

- Whiteboard freehand **pen pressure**: stylus Pointer Events `pressure` maps to stroke width around the brush size (~0.5×–1.5×; mouse/fallback stays constant). Per-point pressure persists so embeds and PDF match the editor.
- Whiteboard tool bar uses **Lucide icons** (Select, Pen, Eraser, Line, Rectangle, Ellipse) with hover tooltips, matching document toolbar conventions.
- Whiteboard **brush size preview**: live circle next to the Width slider updates with size and stroke colour.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.18] - 2026-11-10

Whiteboard doodle tab MVP with Mood Board colour-palette swatches and live doc embeds.

### Added

- **Whiteboard** top-level tab: named board library (create/rename/delete/switch), freehand pen + eraser, stroke width/colour, line/rect/ellipse, select/move/delete, pan/zoom, dark chrome with light paper, and tab-scoped Undo/Redo.
- Whiteboard stroke/fill swatches reuse Mood Board “Create colour palette” tiles (`Palette:` comment hexes). When several palettes exist, pick which one feeds the swatches (defaults to the newest).
- Document toolbar **Whiteboard** inserts a live embed-by-reference (resizable + text align); PDF/print captures the board as an image like Mood Board / Graph.
- Help: Whiteboard brief; Mood Board palette tip notes Whiteboard reuse.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.17] - 2026-11-10

Larger flowchart arrowheads; embed/editor font match.

### Fixed

- Flowchart connector arrowheads enlarged again (18 → 28) so Start/End arrows read clearly in the editor and in document embeds (shared `markerForArrow` size).
- Flowchart node and edge-label fonts match between the Flowcharts editor and live document embeds (both use the UI sans stack; embeds no longer inherit the document serif).

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.16] - 2026-11-10

Print view and paper size; flowchart embed resize; PDF embed parity and Graph badge.

### Added

- Document toolbar **Continuous / Print view** toggle: Print view shows editable paper sheets with margins and gaps, using the same paper size as PDF export.
- Options → Document **Paper size** dropdown (Letter, A4, Legal, Tabloid, A3, A5); persists with other settings and drives Print view + PDF `@page` size.
- Document flowchart embeds are user-resizable and respect text alignment (same east/west handles and toolbar align as media, RGD tables, and Graph embeds). Width persists in the document; live-by-reference updates and centered-in-frame preview are unchanged.

### Fixed

- PDF export: flowchart / RGD / Mood Board / Graph screenshot figures keep the embed’s width and text alignment (parity with media embeds). Title/open chrome is omitted from those screenshots consistently; export waits briefly for all live embed types to settle before capture.
- Document Graph embeds show a **Graph** badge (not Chart).

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.15] - 2026-11-09

Help RGD consolidated to one scrollable page; Graph formula pane always open with Type in-pane.

### Changed

- Help: Rational Game Design is one sidebar entry and one scrollable page (overview, 7 steps, player skills, using RGD in the app, further reading) instead of four separate Help pages.
- Graph formula pane is **always open** for the selected graph (no Formula… toolbar toggle / Close). Bar/line **Type** lives in the formula pane next to Preset.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.14] - 2026-11-09

Graph preview fits its pane without clipping when resized.

### Fixed

- Graph preview / document embeds: chart SVG always fits its pane when resized — plot, axis titles, tick labels, and legend stay fully visible (no overflow clipping). Shared `ChartPreview` sizes its viewBox to the container via `ResizeObserver` while keeping axis-margin layout.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.13] - 2026-11-08

Graph rename, formula presets with explanations, hover tooltips, and reliable chart PDF capture.

### Changed

- **Charts → Graph** in user-facing UI (main tab, sidebar header/empty state, Help, Document insert menu, embed “Open in Graph”, PDF caption). Internal tab id, API, and `charts/*.json` disk paths stay unchanged for project compatibility.

### Added

- Graph preview / document embeds: hover a data point or bar to see a tooltip with the X label, series name, and Y value (shared `ChartPreview` path).
- Graph formula presets: **Linear-Exponential Hybrid** (`a*x + b*(r^x - 1)`), **Logarithmic** (`a * ln(x + c) + b`), **Mitigation (Armor & Defense)** (`x / (x + k)`), **Soft Pity Rate (Gacha)** (`min(pmax, base + max(0, x - start) * ramp)`), and **Cumulative Chance (Loot)** (`1 - (1 - p)^x`), alongside existing Linear / Quadratic / Power / Exponential.
- Formula pane shows a short **preset explanation** (use + variable meanings + design examples) when a preset is selected; Custom shows a generic note. Presets also seed domain and thoughtful axis / series labels (e.g. Armor → Damage reduction).

### Fixed

- PDF export: Graph embeds rasterize as real PNG screenshots in the document body (same path as flowchart / RGD). Chart SVG theme colors are baked to concrete values so axes, grid, and labels survive `html-to-image`; ephemeral hover tips (`data-export-ignore`) are stripped from both the capture filter and the export HTML clone.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.12] - 2026-11-08

Charts axis text layout: title lanes and readable tick formatting.

### Fixed

- Charts preview / document embeds: Y-axis title no longer overlaps tick labels. Left/bottom margins reserve lanes for axis titles vs ticks; Y ticks use nice 1/2/5 steps with sensible formatting (no needless long decimals); crowded X labels thin out; legend packs into rows without colliding with the plot.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.11] - 2026-11-08

Charts polish: editable axis headers and variable chip layout fix.

### Changed

- Charts values table: **X column** and **Y series** headers are inline-editable above the numeric rows (single place to rename axes / series). Renames update the chart preview and live document embeds, and undo/redo on the Charts tab. Duplicate top-level X/Y label fields removed; multi-series charts keep a shared **Y axis** field when needed.

### Fixed

- Charts formula **Variables** chips: value inputs no longer stretch to the chip max-width (global `input:not([type]) { width: 100% }` specificity), so neighboring chips keep a clear gap and each remove (×) stays inside its own chip.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.10] - 2026-11-08

Charts library MVP: formula UX, live embeds, and layout polish.

### Added

- **Charts** top-level tab: named library (create / rename / delete / switch) for table-driven progression graphs. Edit an X column plus numeric Y series, switch **line** / **bar** view. Live Document embeds by chart id (resize + alignment; PDF captures as screenshots). Per-tab Undo/Redo. Persists under `charts/*.json` so the module stays guttable.
- Charts **formula helper**: freeform expression field with addable variables, auto-detect Add for identifiers in the formula (excluding swept `x`), presets (Linear / Quadratic / Power / Exponential), domain start/end/step, and debounced live eval into the table + graph (Apply to table for an immediate commit; inline errors).
- Formula panel **layout polish**: formula on the left, preset selector on the right; compact variable chips (name / value / remove) instead of full-width controls across the panel.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.9] - 2026-11-07

Per-tab undo/redo and full Mood Board colour-palette tiles.

### Added

- Per-tab **Undo / Redo** buttons (and Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z or Ctrl+Y) on Document, Flowcharts, RGD, and Mood Board. Each tab keeps its own history stack — switching tabs does not mix them. Document drives TipTap rich-text history; the tool tabs snapshot meaningful mutations (nodes/edges, form fields, tiles, palette create, etc.). Redo clears after a new edit following undo.

### Fixed

- Mood Board **colour-palette tiles** show the full labelled swatch strip on the board (and in document embeds) instead of clipping the generated PNG inside the default 4:3 photo crop. Click a colour block to copy its hex.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.8] - 2026-11-06

Flowchart descriptions, connector sizing, multi mood boards, and colour palettes.

### Added

- Flowchart **description**: edit from the Flowcharts left list (like Mood Board comments); shown beneath live document embeds and included in PDF/screenshot captures of embed chrome. Older projects migrate to an empty string.
- Mood Board is a named library (create / rename / delete / switch), matching the Flowcharts left-list pattern. Existing single-board projects migrate to a **Main** board with their tiles intact. Document embeds stay live by reference and target the correct board (legacy embeds without a board id resolve against Main / library search).
- Mood Board **Create colour palette**: multi-select image/gif tiles → right-click → choose **k** (default 5) → off-board ~200×200 downsample + local k-means → filter pure white/black extremes → ranked hex blocks as a new board tile with click-to-copy hex chips. Video/audio selections are skipped with a clear status message.

### Changed

- Flowchart connectors: node anchor/handle circles are 25% smaller and arrowheads are 50% larger so end arrows stay visible under the handles (editor, preview, and embeds share the same styles).

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.7] - 2026-11-06

Document flowchart embeds stay centered in their frame.

### Fixed

- Document flowchart embeds stay centered and fully visible in their frame: the preview re-fits on mount, live chart updates, and embed resize, and free pan (including Space+drag) is disabled in embeds only. The Flowcharts editor keeps Miro-like panning.

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

## [0.1.6] - 2026-11-06

Unified flowchart Nodes and Connector toolbar.

### Changed

- Flowchart toolbar: one cohesive **Nodes** control set (semantic types + base shapes) with the same select→change / none→create behavior; one cohesive **Connector** set (Curved/Angled, Start/End arrow) that changes selected edges or sets defaults for new connections. Semantic types apply their default shape in one click (Decision→diamond, Start/End→ellipse, Action/State→rounded).

### Notes for installers

Prefer the **portable zip** (`gdd-studio-v*-windows-*-portable.zip`): unzip and run `gdd-studio.exe`. NSIS/MSI installers are optional. Updater artifacts (`latest.json` + signatures) ship alongside.

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

[Unreleased]: https://github.com/Chozmonster/GDD-Studio/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.6
[0.1.5]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.5
[0.1.4]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.4
[0.1.3]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.3
[0.1.2]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.2
[0.1.1]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.1
[0.1.0]: https://github.com/Chozmonster/GDD-Studio/releases/tag/v0.1.0
