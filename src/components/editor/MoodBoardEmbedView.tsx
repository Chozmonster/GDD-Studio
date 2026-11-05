import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getAssetSrc, listAssets, loadMoodBoard } from "../../api";
import {
  onMoodBoardItemDeleted,
  onMoodBoardSaved,
} from "../../lib/moodBoardEvents";
import type { AssetRecord, MoodBoardItem } from "../../types";
import { MoodMediaFrame } from "../moodboard/MoodMediaFrame";
import {
  MEDIA_EMBED_DEFAULT_WIDTH,
  MEDIA_EMBED_MAX_WIDTH,
  MEDIA_EMBED_MIN_WIDTH,
} from "./mediaEmbedExtension";

type ExtraProps = {
  projectId: string;
  onOpenMoodBoard?: () => void;
};

type Align = "left" | "center" | "right" | "justify";

function normalizeAlign(raw: unknown): Align {
  const v = String(raw ?? "left");
  if (v === "center" || v === "right" || v === "justify") return v;
  return "left";
}

function clampWidth(n: number, maxCap: number): number {
  return Math.min(
    Math.max(MEDIA_EMBED_MIN_WIDTH, Math.round(n)),
    Math.min(MEDIA_EMBED_MAX_WIDTH, maxCap),
  );
}

export function MoodBoardEmbedView(props: NodeViewProps) {
  const itemId = String(props.node.attrs.moodBoardItemId ?? "");
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : MEDIA_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [item, setItem] = useState<MoodBoardItem | null>(null);
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const liveWidthRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
    edge: "e" | "w";
    maxCap: number;
  } | null>(null);

  const width = liveWidth ?? storedWidth;

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
          }
          return;
        }
        const [board, assets] = await Promise.all([
          loadMoodBoard(projectId),
          listAssets(projectId),
        ]);
        if (cancelled) return;
        const found = board.items.find((i) => i.id === itemId) ?? null;
        if (!found) {
          setMissing(true);
          setItem(null);
          setAsset(null);
          return;
        }
        setMissing(false);
        setItem(found);
        setAsset(assets.find((a) => a.id === found.assetId) ?? null);
      } catch (e) {
        if (!cancelled) {
          setMissing(true);
          setError(e instanceof Error ? e.message : String(e));
          setItem(null);
          setAsset(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, itemId]);

  useEffect(() => {
    const offSaved = onMoodBoardSaved((detail) => {
      if (detail.projectId !== projectId) return;
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
      if (detail.projectId !== projectId || detail.itemId !== itemId) return;
      setMissing(true);
      setItem(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, itemId]);

  // Refresh asset metadata when the item's assetId changes (rare; paste clones keep same asset).
  useEffect(() => {
    let cancelled = false;
    if (!item?.assetId) {
      setAsset(null);
      return;
    }
    void listAssets(projectId)
      .then((assets) => {
        if (!cancelled) {
          setAsset(assets.find((a) => a.id === item.assetId) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setAsset(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, item?.assetId]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (!item?.assetId) return;
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
  }, [projectId, item?.assetId]);

  const endResize = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const finalWidth = liveWidthRef.current ?? storedWidth;
      liveWidthRef.current = null;
      setLiveWidth(null);
      if (finalWidth !== storedWidth) {
        props.updateAttributes({ width: finalWidth });
      }
    },
    [props, storedWidth],
  );

  const onResizeMove = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta =
        drag.edge === "e" ? e.clientX - drag.startX : drag.startX - e.clientX;
      const next = clampWidth(drag.startWidth + delta, drag.maxCap);
      liveWidthRef.current = next;
      setLiveWidth(next);
    },
    [],
  );

  const beginResize = useCallback(
    (edge: "e" | "w") => (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const host =
        (e.currentTarget.closest(".editor-canvas") as HTMLElement | null) ??
        (e.currentTarget.parentElement?.parentElement as HTMLElement | null);
      const maxCap = Math.max(
        MEDIA_EMBED_MIN_WIDTH,
        host?.clientWidth ?? MEDIA_EMBED_MAX_WIDTH,
      );
      dragRef.current = {
        startX: e.clientX,
        startWidth: width,
        edge,
        maxCap,
      };
      liveWidthRef.current = width;
      setLiveWidth(width);
    },
    [width],
  );

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

  const alignClass =
    textAlign === "center"
      ? "is-align-center"
      : textAlign === "right"
        ? "is-align-right"
        : textAlign === "justify"
          ? "is-align-justify"
          : "is-align-left";

  const style: CSSProperties = {
    width: `${width}px`,
    maxWidth: "100%",
  };

  const showWest = textAlign === "right" || textAlign === "center";
  const showEast = textAlign !== "right";
  const kind = String(asset?.kind ?? "image");
  const label = asset?.filename || itemId;
  const comment = item?.comment?.trim() ?? "";

  return (
    <NodeViewWrapper
      className={
        missing
          ? `mood-board-embed media-embed broken ${alignClass}`
          : `mood-board-embed media-embed ${alignClass}`
      }
      data-type="mood-board-embed"
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
          onClick={() => extra.onOpenMoodBoard?.()}
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
      {!missing && !loading && src && item && (
        <div className="mood-board-embed-body">
          <MoodMediaFrame
            src={src}
            alt={label}
            kind={kind}
            crop={item.crop}
            border={item.border}
            className="mood-board-embed-frame"
          />
          {comment ? (
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
