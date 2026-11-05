import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAssetSrc,
  listAssets,
  loadMoodBoard,
  saveAssetFromFile,
  saveMoodBoard,
} from "../../api";
import { requestInsertMediaFromMoodBoard } from "../../lib/documentMediaInsert";
import type {
  AssetRecord,
  MoodBoardDocument,
  MoodBoardItem,
  ProjectRecord,
} from "../../types";

type MoodBoardProps = {
  project: ProjectRecord;
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

function isMediaFile(file: File): boolean {
  const t = file.type.toLowerCase();
  if (
    t.startsWith("image/") ||
    t.startsWith("video/") ||
    t.startsWith("audio/")
  ) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac)$/i.test(
    file.name,
  );
}

function emptyBoard(): MoodBoardDocument {
  return { format: "gdd-studio-mood-board", version: 1, items: [] };
}

export function MoodBoard({ project, onInsertedIntoDocument }: MoodBoardProps) {
  const [board, setBoard] = useState<MoodBoardDocument>(emptyBoard);
  const [assets, setAssets] = useState<Record<string, AssetRecord>>({});
  const [status, setStatus] = useState("Loading…");
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clipboardRef = useRef<BoardClipboard | null>(null);
  const boardRef = useRef(board);
  const saveTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  boardRef.current = board;

  const persist = useCallback(
    async (next: MoodBoardDocument) => {
      const saved = await saveMoodBoard(project.id, next);
      setBoard(saved);
      boardRef.current = saved;
      setStatus(`Saved ${new Date().toLocaleTimeString()}`);
    },
    [project.id],
  );

  const schedulePersist = useCallback(
    (next: MoodBoardDocument) => {
      setBoard(next);
      boardRef.current = next;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next).catch((e) =>
          setStatus(e instanceof Error ? e.message : String(e)),
        );
      }, 350);
    },
    [persist],
  );

  const refreshAssets = useCallback(async () => {
    const list = await listAssets(project.id);
    const map: Record<string, AssetRecord> = {};
    for (const a of list) map[a.id] = a;
    setAssets(map);
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [doc] = await Promise.all([
          loadMoodBoard(project.id),
          refreshAssets(),
        ]);
        if (cancelled) return;
        setBoard(doc);
        boardRef.current = doc;
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
  }, [project.id, refreshAssets]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(isMediaFile);
      if (list.length === 0) {
        setStatus("No supported media in drop/paste");
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
      setSelectedId(added[added.length - 1]?.id ?? null);
      setStatus(`Added ${added.length} item${added.length === 1 ? "" : "s"}`);
    },
    [project.id, refreshAssets, schedulePersist],
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
      schedulePersist(next);
      if (selectedId && idSet.has(selectedId)) setSelectedId(null);
    },
    [schedulePersist, selectedId],
  );

  const copyItems = useCallback(
    (ids: string[], mode: "copy" | "cut") => {
      const idSet = new Set(ids);
      const items = boardRef.current.items.filter((i) => idSet.has(i.id));
      if (items.length === 0) return;
      clipboardRef.current = {
        mode,
        items: items.map((i) => ({ ...i })),
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
      }));
      const next: MoodBoardDocument = {
        ...boardRef.current,
        items: [...boardRef.current.items, ...clones],
      };
      schedulePersist(next);
      if (clip.mode === "cut") clipboardRef.current = null;
      setSelectedId(clones[clones.length - 1]?.id ?? null);
      setStatus(`Pasted ${clones.length}`);
      closeMenu();
      return;
    }

    // Fall back to OS clipboard files when available.
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (
            type.startsWith("image/") ||
            type.startsWith("video/") ||
            type.startsWith("audio/")
          ) {
            const blob = await item.getType(type);
            const ext = type.split("/")[1]?.split(";")[0] || "bin";
            files.push(
              new File([blob], `paste.${ext}`, { type: blob.type || type }),
            );
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
  }, [addFiles, closeMenu, schedulePersist]);

  const editComment = useCallback(
    (itemId: string) => {
      const item = boardRef.current.items.find((i) => i.id === itemId);
      if (!item) return;
      const nextComment = window.prompt("Comment", item.comment ?? "");
      if (nextComment === null) {
        closeMenu();
        return;
      }
      const next: MoodBoardDocument = {
        ...boardRef.current,
        items: boardRef.current.items.map((i) =>
          i.id === itemId ? { ...i, comment: nextComment.trim() } : i,
        ),
      };
      schedulePersist(next);
      closeMenu();
    },
    [closeMenu, schedulePersist],
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
        assetId: asset.id,
        kind: String(asset.kind),
        filename: asset.filename,
        mime: asset.mime,
      });
      setStatus(`Inserted ${asset.filename} into Document`);
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
      if (files && files.length > 0 && Array.from(files).some(isMediaFile)) {
        e.preventDefault();
        void addFiles(files);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "v") {
        // Prefer native paste handler for files; board clipboard via explicit Paste menu / Ctrl+Shift+V
        if (clipboardRef.current && !e.shiftKey) {
          const hasOsFiles =
            // Can't introspect OS clipboard sync — only hijack when board clip exists and no input focused
            !(e.target instanceof HTMLInputElement) &&
            !(e.target instanceof HTMLTextAreaElement);
          if (hasOsFiles && clipboardRef.current.items.length) {
            e.preventDefault();
            void pasteClipboard();
          }
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "c" && selectedId) {
        e.preventDefault();
        copyItems([selectedId], "copy");
        return;
      }
      if (meta && e.key.toLowerCase() === "x" && selectedId) {
        e.preventDefault();
        copyItems([selectedId], "cut");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        removeItems([selectedId]);
        setStatus("Deleted");
      }
    };

    el.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [addFiles, copyItems, pasteClipboard, removeItems, selectedId]);

  const activeMenuItem = menu
    ? board.items.find((i) => i.id === menu.itemId)
    : null;

  // Single-column shell (toolbar + main). No fixed sidebars — ready for
  // app-wide resizable pane handles on `.mood-main` later.
  return (
    <section className="mood-shell" ref={surfaceRef} tabIndex={0} aria-label="Mood board">
      <header className="mood-toolbar">
        <div className="mood-toolbar-left">
          <h2>Mood Board</h2>
          <p className="muted tiny mood-blurb">
            Drop or paste reference images, gifs, video, and audio. Right-click
            a tile to comment, copy/cut/paste/delete, or insert into the
            Document at the last cursor position.
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
          accept="image/*,video/*,audio/*,.gif,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a"
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
            setSelectedId(null);
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
                    selected={selectedId === item.id}
                    onSelect={() => setSelectedId(item.id)}
                    onContextMenu={(x, y) => {
                      setSelectedId(item.id);
                      setMenu({ x, y, itemId: item.id });
                    }}
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
            onClick={() => copyItems([activeMenuItem.id], "copy")}
          >
            Copy
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => copyItems([activeMenuItem.id], "cut")}
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
              removeItems([activeMenuItem.id]);
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
            onClick={() => insertIntoDocument(activeMenuItem.id)}
          >
            Insert into document
          </button>
        </div>
      )}
    </section>
  );
}

type MoodTileProps = {
  item: MoodBoardItem;
  asset?: AssetRecord;
  projectId: string;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (x: number, y: number) => void;
};

function MoodTile({
  item,
  asset,
  projectId,
  selected,
  onSelect,
  onContextMenu,
}: MoodTileProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = String(asset?.kind ?? "image");
  const label = asset?.filename || item.assetId;
  const hasComment = Boolean(item.comment?.trim());

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

  return (
    <article
      className={
        selected ? "mood-tile is-selected" : "mood-tile"
      }
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        onContextMenu(e.clientX, e.clientY);
      }}
    >
      <div className="mood-tile-media">
        {hasComment && (
          <span className="mood-comment-badge" title="Has comment">
            Note
          </span>
        )}
        <span className="mood-kind-badge">{kind}</span>
        {error && <p className="muted tiny mood-tile-error">{error}</p>}
        {!error && !src && <p className="muted tiny">Loading…</p>}
        {src && (kind === "image" || kind === "gif") && (
          <img src={src} alt={label} draggable={false} />
        )}
        {src && kind === "video" && (
          <video src={src} controls playsInline preload="metadata" />
        )}
        {src && kind === "audio" && (
          <audio src={src} controls preload="metadata" />
        )}
      </div>
      <div className="mood-tile-meta">
        <p className="mood-tile-name" title={label}>
          {label}
        </p>
        <p
          className={
            hasComment ? "mood-tile-comment" : "mood-tile-comment is-empty"
          }
        >
          {hasComment ? item.comment : "No comment"}
        </p>
      </div>
    </article>
  );
}
