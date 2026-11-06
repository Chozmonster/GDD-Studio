import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAssetSrc,
  listAssets,
  listMoodBoards,
  loadMoodBoard,
  saveAssetFromFile,
  saveMoodBoard,
} from "../../api";
import {
  buildPaletteFromImageSrcs,
  isImageLikeKind,
  parsePaletteHexes,
} from "../../lib/colourPalette";
import { requestInsertMediaFromMoodBoard } from "../../lib/documentMediaInsert";
import { isAllowedMediaFile } from "../../lib/mediaFile";
import { normalizeCrop } from "../../lib/moodBoardEdit";
import {
  emitMoodBoardItemDeleted,
  emitMoodBoardSaved,
} from "../../lib/moodBoardEvents";
import type {
  AssetRecord,
  MoodBoardBorder,
  MoodBoardCrop,
  MoodBoardDocument,
  MoodBoardItem,
  ProjectRecord,
} from "../../types";
import { SplitPane } from "../SplitPane";
import { MoodBoardSidebar } from "./MoodBoardSidebar";
import { MoodBorderDialog } from "./MoodBorderDialog";
import { MoodCropDialog } from "./MoodCropDialog";
import { MoodMediaFrame } from "./MoodMediaFrame";

type MoodBoardProps = {
  project: ProjectRecord;
  /** When set (e.g. from a document embed Open), select that board. */
  focusBoardId?: string | null;
  onInsertedIntoDocument?: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  itemId: string;
};

type BoardClipboard = {
  mode: "copy" | "cut";
  items: MoodBoardItem[];
};

type EditDialog =
  | { kind: "crop"; itemId: string; src: string }
  | { kind: "border"; itemId: string };

function emptyBoard(id = "main", name = "Main"): MoodBoardDocument {
  return {
    format: "gdd-studio-mood-board",
    version: 2,
    id,
    name,
    items: [],
  };
}

export function MoodBoard({
  project,
  focusBoardId,
  onInsertedIntoDocument,
}: MoodBoardProps) {
  const [boardId, setBoardId] = useState("main");
  const [boardName, setBoardName] = useState("Main");
  const [board, setBoard] = useState<MoodBoardDocument>(() => emptyBoard());
  const [assets, setAssets] = useState<Record<string, AssetRecord>>({});
  const [status, setStatus] = useState("Loading…");
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editDialog, setEditDialog] = useState<EditDialog | null>(null);
  const clipboardRef = useRef<BoardClipboard | null>(null);
  const boardRef = useRef(board);
  const boardIdRef = useRef(boardId);
  const selectedIdsRef = useRef(selectedIds);
  const saveTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  boardRef.current = board;
  boardIdRef.current = boardId;
  selectedIdsRef.current = selectedIds;

  const selectBoard = useCallback((id: string, name: string) => {
    setBoardId(id);
    setBoardName(name);
    setSelectedIds(new Set());
    setMenu(null);
    setEditDialog(null);
  }, []);

  const setSelection = useCallback((ids: Iterable<string>) => {
    setSelectedIds(new Set(ids));
  }, []);

  const toggleSelected = useCallback((itemId: string, additive: boolean) => {
    setSelectedIds((prev) => {
      if (!additive) return new Set([itemId]);
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const persist = useCallback(
    async (next: MoodBoardDocument, removedIds: string[] = []) => {
      const id = boardIdRef.current;
      const saved = await saveMoodBoard(project.id, id, next);
      setBoard(saved);
      boardRef.current = saved;
      setBoardName(saved.name);
      emitMoodBoardSaved(project.id, id, saved);
      for (const removed of removedIds) {
        emitMoodBoardItemDeleted(project.id, id, removed);
      }
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
    },
    [project.id],
  );

  const schedulePersist = useCallback(
    (next: MoodBoardDocument, removedIds: string[] = []) => {
      const id = boardIdRef.current;
      setBoard(next);
      boardRef.current = next;
      // Optimistic live update so open Document embeds refresh immediately.
      emitMoodBoardSaved(project.id, id, next);
      for (const removed of removedIds) {
        emitMoodBoardItemDeleted(project.id, id, removed);
      }
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next, []).catch((e) =>
          setStatus(e instanceof Error ? e.message : String(e)),
        );
      }, 350);
    },
    [persist, project.id],
  );

  const refreshAssets = useCallback(async () => {
    const list = await listAssets(project.id);
    const map: Record<string, AssetRecord> = {};
    for (const a of list) map[a.id] = a;
    setAssets(map);
  }, [project.id]);

  // Pick initial / focused board when project or focusBoardId changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listMoodBoards(project.id);
      if (cancelled) return;
      if (focusBoardId && list.some((b) => b.id === focusBoardId)) {
        const found = list.find((b) => b.id === focusBoardId)!;
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
    if (!focusBoardId) return;
    void listMoodBoards(project.id).then((list) => {
      const found = list.find((b) => b.id === focusBoardId);
      if (found) selectBoard(found.id, found.name);
    });
  }, [focusBoardId, project.id, selectBoard]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus("Loading…");
      try {
        const [doc] = await Promise.all([
          loadMoodBoard(project.id, boardId),
          refreshAssets(),
        ]);
        if (cancelled) return;
        setBoard(doc);
        boardRef.current = doc;
        setBoardName(doc.name || boardName);
        emitMoodBoardSaved(project.id, boardId, doc);
        setStatus(doc.items.length ? "Ready" : "Drop or paste media to begin");
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [project.id, boardId, refreshAssets]);

  const updateItem = useCallback(
    (
      itemId: string,
      patch: Partial<
        Pick<MoodBoardItem, "comment" | "crop" | "border">
      >,
    ) => {
      const next: MoodBoardDocument = {
        ...boardRef.current,
        id: boardIdRef.current,
        name: boardRef.current.name || boardName,
        items: boardRef.current.items.map((i) =>
          i.id === itemId ? { ...i, ...patch } : i,
        ),
      };
      schedulePersist(next);
    },
    [boardName, schedulePersist],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(isAllowedMediaFile);
      if (list.length === 0) {
        setStatus("No supported media in drop/paste (SVG is blocked)");
        return;
      }
      const added: MoodBoardItem[] = [];
      for (const file of list) {
        try {
          const asset = await saveAssetFromFile(project.id, file);
          added.push({
            id: crypto.randomUUID(),
            assetId: asset.id,
            comment: "",
            createdAt: Math.floor(Date.now() / 1000),
          });
        } catch (e) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
      if (added.length === 0) return;
      await refreshAssets();
      const next: MoodBoardDocument = {
        ...boardRef.current,
        items: [...boardRef.current.items, ...added],
      };
      schedulePersist(next);
      if (added.length) setSelection(added.map((i) => i.id));
      setStatus(`Added ${added.length} item${added.length === 1 ? "" : "s"}`);
    },
    [project.id, refreshAssets, schedulePersist, setSelection],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".mood-ctx-menu")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  const removeItems = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const next: MoodBoardDocument = {
        ...boardRef.current,
        items: boardRef.current.items.filter((i) => !idSet.has(i.id)),
      };
      schedulePersist(next, ids);
      setSelectedIds((prev) => {
        const nextSel = new Set(prev);
        for (const id of idSet) nextSel.delete(id);
        return nextSel;
      });
    },
    [schedulePersist],
  );

  const copyItems = useCallback(
    (ids: string[], mode: "copy" | "cut") => {
      const idSet = new Set(ids);
      const items = boardRef.current.items.filter((i) => idSet.has(i.id));
      if (items.length === 0) return;
      clipboardRef.current = {
        mode,
        items: items.map((i) => ({
          ...i,
          crop: i.crop ? { ...i.crop } : i.crop,
          border: i.border ? { ...i.border } : i.border,
        })),
      };
      if (mode === "cut") {
        removeItems(ids);
        setStatus(`Cut ${items.length}`);
      } else {
        setStatus(`Copied ${items.length}`);
      }
      closeMenu();
    },
    [closeMenu, removeItems],
  );

  const pasteClipboard = useCallback(async () => {
    const clip = clipboardRef.current;
    if (clip && clip.items.length > 0) {
      const clones = clip.items.map((i) => ({
        ...i,
        id: crypto.randomUUID(),
        createdAt: Math.floor(Date.now() / 1000),
        crop: i.crop ? { ...i.crop } : i.crop,
        border: i.border ? { ...i.border } : i.border,
      }));
      const next: MoodBoardDocument = {
        ...boardRef.current,
        items: [...boardRef.current.items, ...clones],
      };
      schedulePersist(next);
      if (clip.mode === "cut") clipboardRef.current = null;
      setSelection(clones.map((c) => c.id));
      setStatus(`Pasted ${clones.length}`);
      closeMenu();
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.toLowerCase().includes("svg")) continue;
          if (
            type.startsWith("image/") ||
            type.startsWith("video/") ||
            type.startsWith("audio/")
          ) {
            const blob = await item.getType(type);
            const ext = type.split("/")[1]?.split(";")[0] || "bin";
            if (ext.toLowerCase().includes("svg")) continue;
            const file = new File([blob], `paste.${ext}`, {
              type: blob.type || type,
            });
            if (!isAllowedMediaFile(file)) continue;
            files.push(file);
          }
        }
      }
      if (files.length) {
        await addFiles(files);
        closeMenu();
        return;
      }
    } catch {
      /* Permissions / unsupported — ignore */
    }
    setStatus("Clipboard is empty");
    closeMenu();
  }, [addFiles, closeMenu, schedulePersist, setSelection]);

  const createColourPalette = useCallback(async () => {
    const ids =
      selectedIdsRef.current.size > 0
        ? [...selectedIdsRef.current]
        : menu
          ? [menu.itemId]
          : [];
    closeMenu();
    if (ids.length === 0) {
      setStatus("Select one or more image tiles first");
      return;
    }
    const selectedItems = boardRef.current.items.filter((i) =>
      ids.includes(i.id),
    );
    const imageItems = selectedItems.filter((item) => {
      const kind = String(assets[item.assetId]?.kind ?? "image");
      return isImageLikeKind(kind);
    });
    const skipped = selectedItems.length - imageItems.length;
    if (imageItems.length === 0) {
      setStatus(
        "Colour palette needs image or gif tiles — video/audio were skipped",
      );
      return;
    }
    const raw = window.prompt("Number of colours (k)", "5");
    if (raw === null) return;
    const k = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(k) || k < 1 || k > 16) {
      setStatus("k must be an integer from 1 to 16 (default 5)");
      return;
    }
    setStatus(
      skipped > 0
        ? `Building palette from ${imageItems.length} image(s); skipped ${skipped} non-image…`
        : `Building palette from ${imageItems.length} image(s)…`,
    );
    try {
      const srcs: string[] = [];
      for (const item of imageItems) {
        srcs.push(await getAssetSrc(project.id, item.assetId));
      }
      // Off-board analysis — never mutates source tiles.
      const { blob, comment } = await buildPaletteFromImageSrcs(srcs, k);
      const file = new File([blob], `colour-palette-${Date.now()}.png`, {
        type: "image/png",
      });
      const asset = await saveAssetFromFile(project.id, file);
      await refreshAssets();
      const tile: MoodBoardItem = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        comment,
        createdAt: Math.floor(Date.now() / 1000),
      };
      const next: MoodBoardDocument = {
        ...boardRef.current,
        id: boardIdRef.current,
        name: boardRef.current.name || boardName,
        items: [...boardRef.current.items, tile],
      };
      schedulePersist(next);
      setSelection([tile.id]);
      setStatus(
        skipped > 0
          ? `Palette tile added (skipped ${skipped} video/audio)`
          : "Palette tile added — click a hex chip to copy",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, [
    assets,
    boardName,
    closeMenu,
    menu,
    project.id,
    refreshAssets,
    schedulePersist,
    setSelection,
  ]);

  const editComment = useCallback(
    (itemId: string) => {
      const item = boardRef.current.items.find((i) => i.id === itemId);
      if (!item) return;
      const nextComment = window.prompt("Comment", item.comment ?? "");
      if (nextComment === null) {
        closeMenu();
        return;
      }
      updateItem(itemId, { comment: nextComment.trim() });
      closeMenu();
    },
    [closeMenu, updateItem],
  );

  const openCrop = useCallback(
    async (itemId: string) => {
      const item = boardRef.current.items.find((i) => i.id === itemId);
      if (!item) return;
      const asset = assets[item.assetId];
      const kind = String(asset?.kind ?? "image");
      if (kind !== "image" && kind !== "gif") {
        setStatus("Crop is available for images and gifs");
        closeMenu();
        return;
      }
      try {
        const src = await getAssetSrc(project.id, item.assetId);
        setEditDialog({ kind: "crop", itemId, src });
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
      closeMenu();
    },
    [assets, closeMenu, project.id],
  );

  const openBorder = useCallback(
    (itemId: string) => {
      setEditDialog({ kind: "border", itemId });
      closeMenu();
    },
    [closeMenu],
  );

  const insertIntoDocument = useCallback(
    (itemId: string) => {
      const item = boardRef.current.items.find((i) => i.id === itemId);
      if (!item) return;
      const asset = assets[item.assetId];
      if (!asset) {
        setStatus("Asset missing from project store");
        closeMenu();
        return;
      }
      requestInsertMediaFromMoodBoard({
        projectId: project.id,
        moodBoardId: boardIdRef.current,
        moodBoardItemId: item.id,
        filename: asset.filename,
        kind: String(asset.kind),
      });
      setStatus(`Linked ${asset.filename} into Document (live)`);
      closeMenu();
      onInsertedIntoDocument?.();
    },
    [assets, closeMenu, onInsertedIntoDocument, project.id],
  );

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (
        files &&
        files.length > 0 &&
        Array.from(files).some(isAllowedMediaFile)
      ) {
        e.preventDefault();
        void addFiles(files);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "v") {
        if (clipboardRef.current && !e.shiftKey) {
          const hasOsFiles =
            !(e.target instanceof HTMLInputElement) &&
            !(e.target instanceof HTMLTextAreaElement);
          if (hasOsFiles && clipboardRef.current.items.length) {
            e.preventDefault();
            void pasteClipboard();
          }
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "c" && selectedIdsRef.current.size) {
        e.preventDefault();
        copyItems([...selectedIdsRef.current], "copy");
        return;
      }
      if (meta && e.key.toLowerCase() === "x" && selectedIdsRef.current.size) {
        e.preventDefault();
        copyItems([...selectedIdsRef.current], "cut");
        return;
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIdsRef.current.size
      ) {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        removeItems([...selectedIdsRef.current]);
        setStatus("Deleted");
      }
    };

    el.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [addFiles, copyItems, pasteClipboard, removeItems]);

  const activeMenuItem = menu
    ? board.items.find((i) => i.id === menu.itemId)
    : null;
  const activeMenuAsset = activeMenuItem
    ? assets[activeMenuItem.assetId]
    : undefined;
  const menuKind = String(activeMenuAsset?.kind ?? "image");
  const canCrop = menuKind === "image" || menuKind === "gif";
  const menuSelectionIds =
    menu && selectedIds.has(menu.itemId) && selectedIds.size > 0
      ? [...selectedIds]
      : menu
        ? [menu.itemId]
        : [];
  const menuHasImageForPalette = menuSelectionIds.some((id) => {
    const item = board.items.find((i) => i.id === id);
    if (!item) return false;
    return isImageLikeKind(String(assets[item.assetId]?.kind ?? "image"));
  });

  const editItem = editDialog
    ? board.items.find((i) => i.id === editDialog.itemId)
    : null;

  return (
    <div className="flowchart-shell mood-library-shell">
      <SplitPane
        id="moodboard.sidebar"
        defaultSize={210}
        minSize={140}
        maxSize={420}
        minSecondary={320}
      >
        <MoodBoardSidebar
          project={project}
          activeId={boardId}
          onSelect={selectBoard}
        />
        <section
          className="mood-shell"
          ref={surfaceRef}
          tabIndex={0}
          aria-label={`Mood board ${boardName}`}
        >
      <header className="mood-toolbar">
        <div className="mood-toolbar-left">
          <h2>{boardName}</h2>
          <p className="muted tiny mood-blurb">
            Drop or paste reference media. Shift+click multi-selects. Crop and
            border edits stay on the tile and update every live Document embed.
            Right-click for comment, clipboard, colour palette, or Insert into
            document.
          </p>
        </div>
        <div className="mood-toolbar-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            Add media…
          </button>
          <button type="button" className="ghost" onClick={() => void pasteClipboard()}>
            Paste
          </button>
          <span className="muted tiny mood-status" role="status">
            {status}
          </span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,video/*,audio/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </header>

      <div className="mood-main">
        <div
          className={
            dragOver ? "mood-surface is-dragover" : "mood-surface"
          }
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) {
              void addFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => {
            setSelection([]);
            closeMenu();
          }}
        >
          {board.items.length === 0 ? (
            <div className="mood-empty muted">
              <p>No reference media yet.</p>
              <p className="tiny">
                Drop files here, paste from the clipboard, or use Add media…
              </p>
            </div>
          ) : (
            <ul className="mood-grid" aria-label="Mood board items">
              {board.items.map((item) => (
                <li key={item.id}>
                  <MoodTile
                    item={item}
                    asset={assets[item.assetId]}
                    projectId={project.id}
                    selected={selectedIds.has(item.id)}
                    onSelect={(additive) => toggleSelected(item.id, additive)}
                    onContextMenu={(x, y) => {
                      if (!selectedIds.has(item.id)) {
                        setSelection([item.id]);
                      }
                      setMenu({ x, y, itemId: item.id });
                    }}
                    onStatus={setStatus}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {menu && activeMenuItem && (
        <div
          className="mood-ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => editComment(activeMenuItem.id)}
          >
            Comment…
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canCrop}
            title={canCrop ? undefined : "Crop is for images and gifs"}
            onClick={() => void openCrop(activeMenuItem.id)}
          >
            Crop…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openBorder(activeMenuItem.id)}
          >
            Border…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => copyItems(menuSelectionIds, "copy")}
          >
            Copy
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => copyItems(menuSelectionIds, "cut")}
          >
            Cut
          </button>
          <button type="button" role="menuitem" onClick={() => void pasteClipboard()}>
            Paste
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-outline"
            onClick={() => {
              removeItems(menuSelectionIds);
              setStatus("Deleted");
              closeMenu();
            }}
          >
            Delete
          </button>
          <hr className="mood-ctx-sep" />
          <button
            type="button"
            role="menuitem"
            disabled={!menuHasImageForPalette}
            title={
              menuHasImageForPalette
                ? undefined
                : "Select at least one image or gif"
            }
            onClick={() => void createColourPalette()}
          >
            Create colour palette…
          </button>
          <hr className="mood-ctx-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => insertIntoDocument(activeMenuItem.id)}
          >
            Insert into document
          </button>
        </div>
      )}

      {editDialog?.kind === "crop" && editItem && (
        <MoodCropDialog
          src={editDialog.src}
          initial={editItem.crop}
          onCancel={() => setEditDialog(null)}
          onApply={(crop: MoodBoardCrop | null) => {
            updateItem(editDialog.itemId, { crop });
            setEditDialog(null);
            setStatus(crop ? "Crop applied" : "Crop cleared");
          }}
        />
      )}

      {editDialog?.kind === "border" && editItem && (
        <MoodBorderDialog
          initial={editItem.border}
          onCancel={() => setEditDialog(null)}
          onApply={(border: MoodBoardBorder | null) => {
            updateItem(editDialog.itemId, { border });
            setEditDialog(null);
            setStatus(border ? "Border applied" : "Border cleared");
          }}
        />
      )}
        </section>
      </SplitPane>
    </div>
  );
}

type MoodTileProps = {
  item: MoodBoardItem;
  asset?: AssetRecord;
  projectId: string;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onContextMenu: (x: number, y: number) => void;
  onStatus?: (message: string) => void;
};

function MoodTile({
  item,
  asset,
  projectId,
  selected,
  onSelect,
  onContextMenu,
  onStatus,
}: MoodTileProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = String(asset?.kind ?? "image");
  const label = asset?.filename || item.assetId;
  const hasComment = Boolean(item.comment?.trim());
  const paletteHexes = parsePaletteHexes(item.comment ?? "");
  const activeCrop = normalizeCrop(item.crop);
  const hasEdits = Boolean(activeCrop || (item.border && item.border.width > 0));

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(null);
    if (!item.assetId) {
      setError("Missing asset");
      return;
    }
    void getAssetSrc(projectId, item.assetId)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, item.assetId]);

  const copyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      onStatus?.(`Copied ${hex}`);
    } catch {
      onStatus?.(`Could not copy ${hex}`);
    }
  };

  return (
    <article
      className={
        selected ? "mood-tile is-selected" : "mood-tile"
      }
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.shiftKey);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      <div
        className={
          activeCrop ? "mood-tile-media has-crop" : "mood-tile-media"
        }
      >
        {hasComment && (
          <span className="mood-comment-badge" title="Has comment">
            Note
          </span>
        )}
        {hasEdits && (
          <span className="mood-edit-badge" title="Has crop or border edits">
            Edit
          </span>
        )}
        <span className="mood-kind-badge">{kind}</span>
        {error && <p className="muted tiny mood-tile-error">{error}</p>}
        {!error && !src && <p className="muted tiny">Loading…</p>}
        {src && (
          <MoodMediaFrame
            src={src}
            alt={label}
            kind={kind}
            crop={item.crop}
            border={item.border}
            className="mood-tile-frame"
          />
        )}
      </div>
      <div className="mood-tile-meta">
        <p className="mood-tile-name" title={label}>
          {label}
        </p>
        {paletteHexes ? (
          <div className="mood-palette-hexes" aria-label="Palette colours">
            {paletteHexes.map((hex) => (
              <button
                key={hex}
                type="button"
                className="mood-palette-hex"
                title={`Copy ${hex}`}
                style={{ ["--swatch" as string]: hex }}
                onClick={(e) => {
                  e.stopPropagation();
                  void copyHex(hex);
                }}
              >
                <span className="mood-palette-swatch" aria-hidden="true" />
                {hex}
              </button>
            ))}
          </div>
        ) : (
          <p
            className={
              hasComment ? "mood-tile-comment" : "mood-tile-comment is-empty"
            }
          >
            {hasComment ? item.comment : "No comment"}
          </p>
        )}
      </div>
    </article>
  );
}
