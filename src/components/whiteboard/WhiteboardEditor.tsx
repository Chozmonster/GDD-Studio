import {
  Circle,
  Eraser,
  Highlighter,
  Minus,
  MousePointer2,
  Paintbrush,
  Pencil,
  Square,
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
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_FLOW,
  DEFAULT_STROKE_OPACITY,
  DEFAULT_STROKE_WIDTH,
  emptyWhiteboardDocument,
  FALLBACK_SWATCHES,
  findLayer,
  HIGHLIGHTER_DEFAULT_OPACITY,
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
  const [color, setColor] = useState(DEFAULT_STROKE_COLOR);
  const [fill, setFill] = useState<string | null>(null);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [brush, setBrush] = useState<WhiteboardBrush>(DEFAULT_BRUSH);
  const [strokeOpacity, setStrokeOpacity] = useState(DEFAULT_STROKE_OPACITY);
  const [strokeFlow, setStrokeFlow] = useState(DEFAULT_STROKE_FLOW);
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
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIds.size > 0 &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        recordHistory();
        const nextObjects = docRef.current.objects.filter(
          (o) => !selectedIds.has(o.id),
        );
        schedulePersist({ ...docRef.current, objects: nextObjects });
        setSelectedIds(new Set());
        setStatus("Deleted selection");
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
            <label className="whiteboard-inline-field whiteboard-width-field">
              <span className="muted tiny">Width</span>
              <div className="whiteboard-width-controls">
                <input
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  aria-label="Stroke width"
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
            <label className="whiteboard-inline-field">
              <span className="muted tiny">Mood Board palette</span>
              <select
                value={activePaletteKey}
                onChange={(e) => onPaletteSelect(e.target.value)}
                aria-label="Colour palette for swatches"
              >
                {palettes.length === 0 ? (
                  <option value="">No Mood Board palettes yet</option>
                ) : (
                  palettes.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <div
              className="whiteboard-swatches"
              role="listbox"
              aria-label="Colour swatches"
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
              Swatches from Mood Board “Create colour palette”. Click = stroke,
              Shift+click = fill.
            </p>
          </div>

          <WhiteboardLayersPanel doc={doc} onCommit={commitDocument} />

          <WhiteboardSurface
            objects={doc.objects}
            layers={doc.layers}
            activeLayerId={doc.activeLayerId}
            viewport={doc.viewport}
            tool={tool}
            color={color}
            fill={fill}
            strokeWidth={strokeWidth}
            brush={brush}
            strokeOpacity={strokeOpacity}
            strokeFlow={strokeFlow}
            selectedIds={selectedIds}
            onViewportChange={commitViewport}
            onSelectIds={setSelectedIds}
            onCommitObjects={commitObjects}
            onBeforeMutate={recordHistory}
          />
        </div>
      </SplitPane>
    </div>
  );
}
