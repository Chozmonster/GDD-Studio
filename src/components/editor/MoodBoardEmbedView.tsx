/**
 * Live Mood Board item embed — listens for board saves/deletes so crop,
 * border, and comment edits in the Mood Board tab appear here without reload.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  findMoodBoardForItem,
  getAssetSrc,
  listAssets,
  loadMoodBoard,
} from "../../api";
import {
  onMoodBoardDeleted,
  onMoodBoardItemDeleted,
  onMoodBoardSaved,
} from "../../lib/moodBoardEvents";
import { parsePaletteHexes } from "../../lib/colourPalette";
import type { AssetRecord, MoodBoardItem } from "../../types";
import { MoodMediaFrame } from "../moodboard/MoodMediaFrame";
import { MoodPaletteSwatches } from "../moodboard/MoodPaletteSwatches";
import {
  MEDIA_EMBED_DEFAULT_WIDTH,
  MEDIA_EMBED_MAX_WIDTH,
  MEDIA_EMBED_MIN_WIDTH,
} from "./mediaEmbedExtension";
import {
  embedAlignClass,
  embedResizeHandles,
  normalizeEmbedAlign,
  useEmbedWidthResize,
} from "./useEmbedWidthResize";

type ExtraProps = {
  projectId: string;
  onOpenMoodBoard?: (boardId?: string) => void;
};

export function MoodBoardEmbedView(props: NodeViewProps) {
  const itemId = String(props.node.attrs.moodBoardItemId ?? "");
  const attrBoardId = String(props.node.attrs.moodBoardId ?? "").trim();
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : MEDIA_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeEmbedAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [boardId, setBoardId] = useState(attrBoardId || "main");
  const [item, setItem] = useState<MoodBoardItem | null>(null);
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Tracks which assetId `asset` already describes — skips a second listAssets on mount. */
  const loadedAssetIdRef = useRef<string | null>(null);

  const updateWidth = useCallback(
    (width: number) => {
      props.updateAttributes({ width });
    },
    [props],
  );

  const { width, beginResize, onResizeMove, endResize } = useEmbedWidthResize({
    storedWidth,
    bounds: {
      min: MEDIA_EMBED_MIN_WIDTH,
      max: MEDIA_EMBED_MAX_WIDTH,
      defaultWidth: MEDIA_EMBED_DEFAULT_WIDTH,
    },
    updateWidth,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!itemId) {
          if (!cancelled) {
            setMissing(true);
            setItem(null);
            setAsset(null);
            loadedAssetIdRef.current = null;
          }
          return;
        }
        let resolvedBoardId = attrBoardId;
        let found: MoodBoardItem | null = null;
        if (resolvedBoardId) {
          const board = await loadMoodBoard(projectId, resolvedBoardId);
          found = board.items.find((i) => i.id === itemId) ?? null;
        }
        if (!found) {
          const hit = await findMoodBoardForItem(
            projectId,
            itemId,
            attrBoardId || null,
          );
          if (hit) {
            resolvedBoardId = hit.boardId;
            found = hit.document.items.find((i) => i.id === itemId) ?? null;
            // Backfill board id on legacy embeds so later saves target correctly.
            if (!attrBoardId && resolvedBoardId) {
              props.updateAttributes({ moodBoardId: resolvedBoardId });
            }
          }
        }
        if (cancelled) return;
        if (!found || !resolvedBoardId) {
          setMissing(true);
          setItem(null);
          setAsset(null);
          loadedAssetIdRef.current = null;
          return;
        }
        setBoardId(resolvedBoardId);
        setMissing(false);
        setItem(found);
        loadedAssetIdRef.current = found.assetId;
        const assets = await listAssets(projectId);
        if (cancelled) return;
        setAsset(assets.find((a) => a.id === found!.assetId) ?? null);
      } catch (e) {
        if (!cancelled) {
          setMissing(true);
          setError(e instanceof Error ? e.message : String(e));
          setItem(null);
          setAsset(null);
          loadedAssetIdRef.current = null;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, itemId, attrBoardId]);

  useEffect(() => {
    const offSaved = onMoodBoardSaved((detail) => {
      if (detail.projectId !== projectId) return;
      if (detail.boardId !== boardId) return;
      const found = detail.document.items.find((i) => i.id === itemId) ?? null;
      if (!found) {
        setMissing(true);
        setItem(null);
        return;
      }
      setMissing(false);
      setItem({ ...found });
      setLoading(false);
    });
    const offDeleted = onMoodBoardItemDeleted((detail) => {
      if (
        detail.projectId !== projectId ||
        detail.boardId !== boardId ||
        detail.itemId !== itemId
      ) {
        return;
      }
      setMissing(true);
      setItem(null);
    });
    const offBoardDeleted = onMoodBoardDeleted((detail) => {
      if (detail.projectId !== projectId || detail.boardId !== boardId) return;
      setMissing(true);
      setItem(null);
    });
    return () => {
      offSaved();
      offDeleted();
      offBoardDeleted();
    };
  }, [projectId, boardId, itemId]);

  // Refresh asset metadata only when the linked assetId changes (rare).
  useEffect(() => {
    let cancelled = false;
    if (!item?.assetId) {
      loadedAssetIdRef.current = null;
      setAsset(null);
      return;
    }
    if (loadedAssetIdRef.current === item.assetId) return;
    void listAssets(projectId)
      .then((assets) => {
        if (cancelled) return;
        loadedAssetIdRef.current = item.assetId;
        setAsset(assets.find((a) => a.id === item.assetId) ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          loadedAssetIdRef.current = null;
          setAsset(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, item?.assetId]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (!item?.assetId) return;
    // Palette embeds render labelled swatches from the comment — skip asset load.
    if (parsePaletteHexes(item.comment ?? "")) return;
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
  }, [projectId, item?.assetId, item?.comment]);

  const selectEmbed = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (
        (e.target as HTMLElement | null)?.closest?.(
          "button, .rgd-embed-resize-handle, audio, video",
        )
      ) {
        return;
      }
      const pos = props.getPos();
      if (typeof pos !== "number") return;
      e.preventDefault();
      props.editor.chain().setNodeSelection(pos).focus().run();
    },
    [props],
  );

  const alignClass = embedAlignClass(textAlign);
  const { showWest, showEast } = embedResizeHandles(textAlign);

  const style: CSSProperties = {
    width: `${width}px`,
    maxWidth: "100%",
  };

  const kind = String(asset?.kind ?? "image");
  const label = asset?.filename || itemId;
  const comment = item?.comment?.trim() ?? "";
  const paletteHexes = parsePaletteHexes(comment);

  return (
    <NodeViewWrapper
      className={
        missing
          ? `mood-board-embed media-embed broken ${alignClass}`
          : `mood-board-embed media-embed ${alignClass}`
      }
      data-type="mood-board-embed"
      data-mood-board-id={boardId}
      data-mood-board-item-id={itemId}
      data-width={width}
      data-text-align={textAlign}
      style={style}
      contentEditable={false}
      onMouseDown={selectEmbed}
    >
      <div className="media-embed-chrome mood-board-embed-chrome" data-drag-handle>
        <span className="media-embed-kind">Mood Board</span>
        <span className="media-embed-name" title={label}>
          {missing ? `Missing item “${itemId || "?"}”` : label}
        </span>
        <button
          type="button"
          className="ghost tiny-btn"
          disabled={missing}
          onClick={() => extra.onOpenMoodBoard?.(boardId)}
        >
          Open board
        </button>
      </div>
      {loading && <p className="muted tiny embed-status">Loading…</p>}
      {missing && (
        <p className="error embed-status">
          Broken embed — this Mood Board item was deleted. Insert another from
          the Mood Board.
        </p>
      )}
      {error && !missing && (
        <p className="media-embed-error muted tiny">{error}</p>
      )}
      {!missing && !loading && item && (paletteHexes || src) && (
        <div className="mood-board-embed-body">
          {paletteHexes ? (
            <MoodPaletteSwatches
              hexes={paletteHexes}
              border={item.border}
              className="mood-board-embed-palette"
            />
          ) : src ? (
            <MoodMediaFrame
              src={src}
              alt={label}
              kind={kind}
              crop={item.crop}
              border={item.border}
              className="mood-board-embed-frame"
            />
          ) : null}
          {comment && !paletteHexes ? (
            <p className="mood-board-embed-comment">{comment}</p>
          ) : null}
        </div>
      )}
      {showWest && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Mood Board media width"
          aria-valuemin={MEDIA_EMBED_MIN_WIDTH}
          aria-valuemax={MEDIA_EMBED_MAX_WIDTH}
          aria-valuenow={width}
          onPointerDown={beginResize("w")}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      )}
      {showEast && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-e"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Mood Board media width"
          aria-valuemin={MEDIA_EMBED_MIN_WIDTH}
          aria-valuemax={MEDIA_EMBED_MAX_WIDTH}
          aria-valuenow={width}
          onPointerDown={beginResize("e")}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      )}
    </NodeViewWrapper>
  );
}
