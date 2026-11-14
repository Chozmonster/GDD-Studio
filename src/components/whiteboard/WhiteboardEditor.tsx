import {
  Circle,
  Copy,
  Eraser,
  Highlighter,
  Lasso,
  Minus,
  MousePointer2,
  Paintbrush,
  Pencil,
  Square,
  SquareDashed,
  Type,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listWhiteboards,
  loadWhiteboard,
  saveWhiteboard,
} from "../../api";
import {
  useHistoryStack,
  type PushHistoryOptions,
} from "../../hooks/useHistoryStack";
import { onMoodBoardDeleted, onMoodBoardSaved } from "../../lib/moodBoardEvents";
import { undoRedoFromKeyboard } from "../../lib/undoKeyboard";
import { emitWhiteboardSaved } from "../../lib/whiteboardEvents";
import {
  listProjectMoodPalettes,
  pickDefaultPalette,
  type MoodPaletteOption,
} from "../../lib/whiteboardPalettes";
import type {
  ProjectRecord,
  WhiteboardBrush,
  WhiteboardDocument,
  WhiteboardObject,
  WhiteboardPaletteRef,
  WhiteboardSelectMode,
  WhiteboardTool,
  WhiteboardViewport,
} from "../../types";
import { ToolbarIconButton } from "../editor/ToolbarIconButton";
import { UndoRedoButtons } from "../editor/UndoRedoButtons";
import { SplitPane } from "../SplitPane";
import { WhiteboardLayersPanel } from "./WhiteboardLayersPanel";
import { WhiteboardSidebar } from "./WhiteboardSidebar";
import { WhiteboardSurface } from "./WhiteboardSurface";
import {
  cloneWhiteboard,
  DEFAULT_BRUSH,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_FLOW,
  DEFAULT_STROKE_OPACITY,
  DEFAULT_STROKE_WIDTH,
  duplicateObjects,
  emptyWhiteboardDocument,
  FALLBACK_SWATCHES,
  findLayer,
  HIGHLIGHTER_DEFAULT_OPACITY,
  interactiveObjects,
  layerIsDrawable,
  normalizeWhiteboard,
  pathStrokeAlpha,
} from "./whiteboardModel";

const BRUSHES: { id: WhiteboardBrush; label: string; icon: LucideIcon }[] = [
  { id: "hard", label: "Hard brush", icon: Pencil },
  { id: "soft", label: "Soft brush", icon: Paintbrush },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
];

type WhiteboardEditorProps = {
  project: ProjectRecord;
  active?: boolean;
  focusWhiteboardId?: string | null;
};

const TOOLS: { id: WhiteboardTool; label: string; icon: LucideIcon }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pen", label: "Pen", icon: Pencil },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "line", label: "Line", icon: Minus },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "text", label: "Type", icon: Type },
];

export function WhiteboardEditor({
  project,
  active = true,
  focusWhiteboardId,
}: WhiteboardEditorProps) {
  const [boardId, setBoardId] = useState("main");
  const [boardName, setBoardName] = useState("Main");
  const [doc, setDoc] = useState<WhiteboardDocument>(() =>
    emptyWhiteboardDocument(),
  );
  const [status, setStatus] = useState("Loading…");
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [selectMode, setSelectMode] =
    useState<WhiteboardSelectMode>("marquee");
  const [color, setColor] = useState(DEFAULT_STROKE_COLOR);
  const [fill, setFill] = useState<string | null>(null);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [brush, setBrush] = useState<WhiteboardBrush>(DEFAULT_BRUSH);
  const [strokeOpacity, setStrokeOpacity] = useState(DEFAULT_STROKE_OPACITY);
  const [strokeFlow, setStrokeFlow] = useState(DEFAULT_STROKE_FLOW);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [palettes, setPalettes] = useState<MoodPaletteOption[]>([]);
  const [activePaletteKey, setActivePaletteKey] = useState<string>("");

  const docRef = useRef(doc);
  const boardIdRef = useRef(boardId);
  const saveTimer = useRef<number | null>(null);
  const applyingHistory = useRef(false);
  const {
    push: pushHistory,
    undo: undoHistory,
    redo: redoHistory,
    clear: clearHistory,
    canUndo,
    canRedo,
  } = useHistoryStack<WhiteboardDocument>();

  docRef.current = doc;
  boardIdRef.current = boardId;

  const selectBoard = useCallback((id: string, name: string) => {
    setBoardId(id);
    setBoardName(name);
    setSelectedIds(new Set());
  }, []);

  const persist = useCallback(
    async (next: WhiteboardDocument) => {
      const id = boardIdRef.current;
      const saved = await saveWhiteboard(project.id, id, next);
      setDoc(saved);
      docRef.current = saved;
      setBoardName(saved.name);
      emitWhiteboardSaved(project.id, id, saved);
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
    },
    [project.id],
  );

  const schedulePersist = useCallback(
    (next: WhiteboardDocument) => {
      const id = boardIdRef.current;
      const normalized = normalizeWhiteboard(next);
      setDoc(normalized);
      docRef.current = normalized;
      emitWhiteboardSaved(project.id, id, normalized);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(normalized).catch((e) =>
          setStatus(e instanceof Error ? e.message : String(e)),
        );
      }, 350);
    },
    [persist, project.id],
  );

  const recordHistory = useCallback(
    (opts?: PushHistoryOptions) => {
      if (applyingHistory.current) return;
      pushHistory(cloneWhiteboard(docRef.current), opts);
    },
    [pushHistory],
  );

  const applySnapshot = useCallback(
    (snap: WhiteboardDocument) => {
      applyingHistory.current = true;
      schedulePersist(cloneWhiteboard(snap));
      setBoardName(snap.name || boardName);
      setSelectedIds(new Set());
      applyingHistory.current = false;
    },
    [boardName, schedulePersist],
  );

  const handleUndo = useCallback(() => {
    const prev = undoHistory(cloneWhiteboard(docRef.current));
    if (!prev) return;
    applySnapshot(prev);
    setStatus("Undid last whiteboard edit");
  }, [undoHistory, applySnapshot]);

  const handleRedo = useCallback(() => {
    const next = redoHistory(cloneWhiteboard(docRef.current));
    if (!next) return;
    applySnapshot(next);
    setStatus("Redid whiteboard edit");
  }, [redoHistory, applySnapshot]);

  const refreshPalettes = useCallback(async () => {
    const options = await listProjectMoodPalettes(project.id);
    setPalettes(options);
    const preferred = docRef.current.paletteRef;
    const picked = pickDefaultPalette(options, preferred);
    setActivePaletteKey(picked?.key ?? "");
    if (picked && (!preferred || preferred.itemId !== picked.itemId)) {
      // Keep doc pointer in sync with a sensible default without history noise.
      const nextRef: WhiteboardPaletteRef = {
        moodBoardId: picked.moodBoardId,
        itemId: picked.itemId,
      };
      if (
        preferred?.moodBoardId !== nextRef.moodBoardId ||
        preferred?.itemId !== nextRef.itemId
      ) {
        const current = docRef.current;
        if (!preferred) {
          schedulePersist({ ...current, paletteRef: nextRef });
        }
      }
    }
    if (picked?.hexes[0] && !preferred) {
      setColor(picked.hexes[0]);
    }
  }, [project.id, schedulePersist]);

  useEffect(() => {
    void refreshPalettes();
    const offSaved = onMoodBoardSaved((detail) => {
      if (detail.projectId !== project.id) return;
      void refreshPalettes();
    });
    const offDeleted = onMoodBoardDeleted((detail) => {
      if (detail.projectId !== project.id) return;
      void refreshPalettes();
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [project.id, refreshPalettes]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listWhiteboards(project.id);
      if (cancelled) return;
      if (
        focusWhiteboardId &&
        list.some((c) => c.id === focusWhiteboardId)
      ) {
        const found = list.find((c) => c.id === focusWhiteboardId)!;
        selectBoard(found.id, found.name);
        return;
      }
      if (list[0]) selectBoard(list[0].id, list[0].name);
      else selectBoard("main", "Main");
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, selectBoard]);

  useEffect(() => {
    if (!focusWhiteboardId) return;
    void listWhiteboards(project.id).then((list) => {
      const found = list.find((c) => c.id === focusWhiteboardId);
      if (found) selectBoard(found.id, found.name);
    });
  }, [focusWhiteboardId, project.id, selectBoard]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("Loading…");
      try {
        const loaded = normalizeWhiteboard(
          await loadWhiteboard(project.id, boardId),
        );
        if (cancelled) return;
        setDoc(loaded);
        docRef.current = loaded;
        setBoardName(loaded.name);
        clearHistory();
        setSelectedIds(new Set());
        setStatus("Ready");
        const options = await listProjectMoodPalettes(project.id);
        if (cancelled) return;
        setPalettes(options);
        const picked = pickDefaultPalette(options, loaded.paletteRef);
        setActivePaletteKey(picked?.key ?? "");
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, boardId, clearHistory]);

  const duplicateSelection = useCallback(() => {
    const current = docRef.current;
    const editable = interactiveObjects(current.objects, current.layers);
    const selected = editable.filter((o) => selectedIds.has(o.id));
    if (selected.length === 0) {
      setStatus("Nothing to duplicate — select unlocked ink first");
      return;
    }
    recordHistory();
    const copies = duplicateObjects(selected);
    schedulePersist({
      ...current,
      objects: [...current.objects, ...copies],
    });
    setSelectedIds(new Set(copies.map((o) => o.id)));
    setStatus(`Duplicated ${copies.length} object${copies.length === 1 ? "" : "s"}`);
  }, [recordHistory, schedulePersist, selectedIds]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const action = undoRedoFromKeyboard(e);
      if (action === "undo" && canUndo) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (action === "redo" && canRedo) {
        e.preventDefault();
        handleRedo();
        return;
      }
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIds.size > 0 &&
        !typing
      ) {
        e.preventDefault();
        const current = docRef.current;
        const editableIds = new Set(
          interactiveObjects(current.objects, current.layers).map((o) => o.id),
        );
        const removeIds = [...selectedIds].filter((id) => editableIds.has(id));
        if (removeIds.length === 0) {
          setStatus("Selection is on locked/hidden layers");
          return;
        }
        recordHistory();
        const remove = new Set(removeIds);
        schedulePersist({
          ...current,
          objects: current.objects.filter((o) => !remove.has(o.id)),
        });
        setSelectedIds(new Set());
        setStatus("Deleted selection");
        return;
      }
      if (
        (e.key === "d" || e.key === "D") &&
        (e.metaKey || e.ctrlKey) &&
        !typing
      ) {
        e.preventDefault();
        duplicateSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    selectedIds,
    recordHistory,
    schedulePersist,
    duplicateSelection,
  ]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const applyField = <K extends keyof WhiteboardDocument>(
    key: K,
    value: WhiteboardDocument[K],
    historyOpts?: PushHistoryOptions,
  ) => {
    recordHistory(historyOpts);
    schedulePersist({ ...docRef.current, [key]: value });
  };

  const commitDocument = (
    next: WhiteboardDocument,
    historyOpts?: PushHistoryOptions,
  ) => {
    recordHistory(historyOpts);
    const normalized = normalizeWhiteboard(next);
    // Drop selection of ink that became hidden/locked.
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const nextIds = new Set<string>();
      for (const id of prev) {
        const obj = normalized.objects.find((o) => o.id === id);
        if (!obj) continue;
        if (layerIsDrawable(findLayer(normalized.layers, obj.layerId))) {
          nextIds.add(id);
        }
      }
      return nextIds;
    });
    schedulePersist(normalized);
  };

  const commitObjects = (next: WhiteboardObject[]) => {
    schedulePersist({ ...docRef.current, objects: next });
  };

  const commitViewport = (viewport: WhiteboardViewport) => {
    // Viewport changes are not undoable — update quietly.
    const next = { ...docRef.current, viewport };
    setDoc(next);
    docRef.current = next;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(normalizeWhiteboard(next)).catch((e) =>
        setStatus(e instanceof Error ? e.message : String(e)),
      );
    }, 500);
  };

  const activePalette =
    palettes.find((p) => p.key === activePaletteKey) ?? null;
  const swatches = activePalette?.hexes?.length
    ? activePalette.hexes
    : [...FALLBACK_SWATCHES];

  const onPaletteSelect = (key: string) => {
    setActivePaletteKey(key);
    const picked = palettes.find((p) => p.key === key) ?? null;
    const ref: WhiteboardPaletteRef | null = picked
      ? { moodBoardId: picked.moodBoardId, itemId: picked.itemId }
      : null;
    recordHistory();
    schedulePersist({ ...docRef.current, paletteRef: ref });
    if (picked?.hexes[0]) setColor(picked.hexes[0]);
  };

  const selectBrush = (next: WhiteboardBrush) => {
    setBrush(next);
    setTool("pen");
    if (next === "highlighter" && strokeOpacity >= 0.95) {
      setStrokeOpacity(HIGHLIGHTER_DEFAULT_OPACITY);
    } else if (next !== "highlighter" && strokeOpacity === HIGHLIGHTER_DEFAULT_OPACITY) {
      setStrokeOpacity(DEFAULT_STROKE_OPACITY);
    }
  };

  const previewColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#1A1A1A";
  const previewAlpha = pathStrokeAlpha({
    opacity: strokeOpacity,
    flow: strokeFlow,
  });
  const previewSoft = brush === "soft";
  const previewHighlight = brush === "highlighter";
  const textSizeContext =
    tool === "text" ||
    [...selectedIds].some((id) => {
      const obj = doc.objects.find((o) => o.id === id);
      return obj?.kind === "text";
    });
  // Brush tools / shapes share stroke width; text context highlights Text size.
  const brushSizeContext =
    tool === "pen" ||
    tool === "eraser" ||
    tool === "line" ||
    tool === "rect" ||
    tool === "ellipse" ||
    (!textSizeContext && tool === "select");

  return (
    <div className="flowchart-shell whiteboard-shell">
      <SplitPane
        id="whiteboard.sidebar"
        defaultSize={220}
        minSize={160}
        maxSize={360}
        minSecondary={320}
        stackBelow={840}
      >
        <WhiteboardSidebar
          project={project}
          activeId={boardId}
          onSelect={selectBoard}
        />
        <div className="flowchart-main whiteboard-main">
          <header className="flowchart-toolbar whiteboard-toolbar">
            <div className="flowchart-toolbar-left">
              <h2>{boardName}</h2>
              <p className="muted tiny flowchart-status" role="status">
                {status}
              </p>
            </div>
            <div className="flowchart-toolbar-actions">
              <UndoRedoButtons
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            </div>
          </header>

          <div className="whiteboard-meta-row">
            <label className="whiteboard-inline-field grow">
              <span className="muted tiny">Description</span>
              <input
                value={doc.description}
                placeholder="Optional note under embeds"
                onChange={(e) =>
                  applyField("description", e.target.value, {
                    coalesce: true,
                  })
                }
              />
            </label>
          </div>

          <div className="whiteboard-tools" role="toolbar" aria-label="Drawing tools">
            <div className="whiteboard-tool-group">
              {TOOLS.map((t) => (
                <ToolbarIconButton
                  key={t.id}
                  label={t.label}
                  icon={t.icon}
                  pressed={tool === t.id}
                  className={
                    tool === t.id
                      ? "whiteboard-tool-btn is-active"
                      : "whiteboard-tool-btn"
                  }
                  onClick={() => setTool(t.id)}
                />
              ))}
            </div>
            <div
              className="whiteboard-tool-group"
              role="group"
              aria-label="Select mode"
            >
              <ToolbarIconButton
                label="Marquee select"
                icon={SquareDashed}
                pressed={tool === "select" && selectMode === "marquee"}
                className={
                  tool === "select" && selectMode === "marquee"
                    ? "whiteboard-tool-btn is-active"
                    : "whiteboard-tool-btn"
                }
                onClick={() => {
                  setSelectMode("marquee");
                  setTool("select");
                }}
              />
              <ToolbarIconButton
                label="Lasso select"
                icon={Lasso}
                pressed={tool === "select" && selectMode === "lasso"}
                className={
                  tool === "select" && selectMode === "lasso"
                    ? "whiteboard-tool-btn is-active"
                    : "whiteboard-tool-btn"
                }
                onClick={() => {
                  setSelectMode("lasso");
                  setTool("select");
                }}
              />
              <ToolbarIconButton
                label="Duplicate selection (Ctrl/Cmd+D)"
                icon={Copy}
                className="whiteboard-tool-btn"
                disabled={selectedIds.size === 0}
                onClick={duplicateSelection}
              />
            </div>
            <div
              className="whiteboard-tool-group"
              role="group"
              aria-label="Brush style"
            >
              {BRUSHES.map((b) => (
                <ToolbarIconButton
                  key={b.id}
                  label={b.label}
                  icon={b.icon}
                  pressed={tool === "pen" && brush === b.id}
                  className={
                    tool === "pen" && brush === b.id
                      ? "whiteboard-tool-btn is-active"
                      : "whiteboard-tool-btn"
                  }
                  onClick={() => selectBrush(b.id)}
                />
              ))}
            </div>
            <label
              className={
                brushSizeContext
                  ? "whiteboard-inline-field whiteboard-width-field is-context-active"
                  : "whiteboard-inline-field whiteboard-width-field"
              }
            >
              <span className="muted tiny">Brush size</span>
              <div className="whiteboard-width-controls">
                <input
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  aria-label="Brush size"
                />
                <span
                  className={
                    previewSoft
                      ? "whiteboard-brush-preview is-soft"
                      : previewHighlight
                        ? "whiteboard-brush-preview is-highlighter"
                        : "whiteboard-brush-preview"
                  }
                  title={`Brush ${strokeWidth}px · ${Math.round(previewAlpha * 100)}%`}
                  aria-hidden
                >
                  <span
                    className="whiteboard-brush-preview-dot"
                    style={{
                      width: strokeWidth,
                      height: strokeWidth,
                      background: previewColor,
                      opacity: previewAlpha,
                    }}
                  />
                </span>
                <span className="muted tiny whiteboard-brush-preview-label">
                  {strokeWidth}px
                </span>
              </div>
            </label>
            <label
              className={
                textSizeContext
                  ? "whiteboard-inline-field is-context-active"
                  : "whiteboard-inline-field"
              }
            >
              <span className="muted tiny">Text size</span>
              <div className="whiteboard-width-controls">
                <input
                  type="range"
                  min={8}
                  max={96}
                  step={1}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  aria-label="Text size"
                />
                <span className="muted tiny whiteboard-brush-preview-label">
                  {fontSize}px
                </span>
              </div>
            </label>
            <label className="whiteboard-inline-field">
              <span className="muted tiny">Opacity</span>
              <div className="whiteboard-width-controls">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(strokeOpacity * 100)}
                  onChange={(e) =>
                    setStrokeOpacity(Number(e.target.value) / 100)
                  }
                  aria-label="Stroke opacity"
                />
                <span className="muted tiny whiteboard-brush-preview-label">
                  {Math.round(strokeOpacity * 100)}%
                </span>
              </div>
            </label>
            <label className="whiteboard-inline-field">
              <span className="muted tiny">Flow</span>
              <div className="whiteboard-width-controls">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round(strokeFlow * 100)}
                  onChange={(e) => setStrokeFlow(Number(e.target.value) / 100)}
                  aria-label="Stroke flow"
                />
                <span className="muted tiny whiteboard-brush-preview-label">
                  {Math.round(strokeFlow * 100)}%
                </span>
              </div>
            </label>
            <label className="whiteboard-inline-field">
              <span className="muted tiny">Stroke</span>
              <input
                type="color"
                value={previewColor}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                aria-label="Stroke color"
              />
            </label>
            <label className="whiteboard-inline-field">
              <span className="muted tiny">Fill</span>
              <input
                type="color"
                value={
                  fill && /^#[0-9A-Fa-f]{6}$/.test(fill) ? fill : "#FFFFFF"
                }
                onChange={(e) => setFill(e.target.value.toUpperCase())}
                aria-label="Fill color"
              />
            </label>
            <button
              type="button"
              className="ghost tiny-btn"
              onClick={() => setFill(null)}
              title="No fill"
            >
              No fill
            </button>
          </div>

          <div className="whiteboard-palette-row">
            <div className="whiteboard-palette-picker">
              <span className="muted tiny" id="wb-palette-picker-label">
                Mood Board palette
              </span>
              {palettes.length === 0 ? (
                <p className="muted tiny whiteboard-palette-empty">
                  No Mood Board palettes yet — create one via Mood Board → Create
                  colour palette.
                </p>
              ) : (
                <div
                  className="whiteboard-palette-options"
                  role="listbox"
                  aria-labelledby="wb-palette-picker-label"
                  aria-label="Colour palette for swatches"
                >
                  {palettes.map((p) => {
                    const selected = p.key === activePaletteKey;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={
                          selected
                            ? "whiteboard-palette-option is-active"
                            : "whiteboard-palette-option"
                        }
                        title={p.label}
                        onClick={() => onPaletteSelect(p.key)}
                      >
                        <span className="whiteboard-palette-option-name">
                          {p.name}
                        </span>
                        <span
                          className="whiteboard-palette-option-swatches"
                          aria-hidden
                        >
                          {p.hexes.map((hex) => (
                            <span
                              key={`${p.key}-${hex}`}
                              className="whiteboard-palette-option-chip"
                              style={{ background: hex }}
                            />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div
              className="whiteboard-swatches"
              role="listbox"
              aria-label="Active palette swatches"
            >
              {swatches.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={
                    color.toUpperCase() === hex.toUpperCase()
                      ? "whiteboard-swatch is-active"
                      : "whiteboard-swatch"
                  }
                  style={{ background: hex }}
                  title={`${hex} — click stroke, Shift+click fill`}
                  aria-label={`Use ${hex}`}
                  onClick={(e) => {
                    if (e.shiftKey) setFill(hex);
                    else setColor(hex);
                  }}
                />
              ))}
            </div>
            <p className="muted tiny whiteboard-swatch-hint">
              Pick a named Mood Board palette above. Active swatches: click =
              stroke, Shift+click = fill.
            </p>
          </div>

          <div className="whiteboard-stage">
            <WhiteboardSurface
              objects={doc.objects}
              layers={doc.layers}
              activeLayerId={doc.activeLayerId}
              viewport={doc.viewport}
              tool={tool}
              selectMode={selectMode}
              color={color}
              fill={fill}
              strokeWidth={strokeWidth}
              brush={brush}
              strokeOpacity={strokeOpacity}
              strokeFlow={strokeFlow}
              fontSize={fontSize}
              selectedIds={selectedIds}
              onViewportChange={commitViewport}
              onSelectIds={setSelectedIds}
              onCommitObjects={commitObjects}
              onBeforeMutate={recordHistory}
            />
            <WhiteboardLayersPanel doc={doc} onCommit={commitDocument} />
          </div>
        </div>
      </SplitPane>
    </div>
  );
}
