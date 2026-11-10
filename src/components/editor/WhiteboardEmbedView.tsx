/**
 * Live whiteboard embed — image-only frame (centered fit like flowchart
 * embeds). Subscribes to save/delete events so the Document tab never shows
 * a stale doodle after Whiteboard tab edits.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { loadWhiteboard, whiteboardExists } from "../../api";
import {
  onWhiteboardDeleted,
  onWhiteboardSaved,
} from "../../lib/whiteboardEvents";
import type { WhiteboardDocument } from "../../types";
import { WhiteboardPreview } from "../whiteboard/WhiteboardPreview";
import { normalizeWhiteboard } from "../whiteboard/whiteboardModel";
import {
  WHITEBOARD_EMBED_DEFAULT_WIDTH,
  WHITEBOARD_EMBED_MAX_WIDTH,
  WHITEBOARD_EMBED_MIN_WIDTH,
} from "./whiteboardEmbedExtension";
import {
  embedAlignClass,
  embedResizeHandles,
  normalizeEmbedAlign,
  useEmbedWidthResize,
} from "./useEmbedWidthResize";

type ExtraProps = {
  projectId: string;
  onOpenWhiteboard?: (whiteboardId: string) => void;
};

export function WhiteboardEmbedView(props: NodeViewProps) {
  const whiteboardId = String(props.node.attrs.whiteboardId ?? "");
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : WHITEBOARD_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeEmbedAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [doc, setDoc] = useState<WhiteboardDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const updateWidth = useCallback(
    (width: number) => {
      props.updateAttributes({ width });
    },
    [props],
  );

  const { width, beginResize, onResizeMove, endResize } = useEmbedWidthResize({
    storedWidth,
    bounds: {
      min: WHITEBOARD_EMBED_MIN_WIDTH,
      max: WHITEBOARD_EMBED_MAX_WIDTH,
      defaultWidth: WHITEBOARD_EMBED_DEFAULT_WIDTH,
    },
    updateWidth,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (!whiteboardId) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const exists = await whiteboardExists(projectId, whiteboardId);
        if (!exists && whiteboardId !== "main") {
          try {
            const loaded = normalizeWhiteboard(
              await loadWhiteboard(projectId, whiteboardId),
            );
            if (!cancelled) {
              setMissing(false);
              setDoc(loaded);
            }
            return;
          } catch {
            if (!cancelled) {
              setMissing(true);
              setDoc(null);
            }
            return;
          }
        }
        const loaded = normalizeWhiteboard(
          await loadWhiteboard(projectId, whiteboardId),
        );
        if (!cancelled) {
          setMissing(false);
          setDoc(loaded);
        }
      } catch {
        if (!cancelled) {
          setMissing(true);
          setDoc(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, whiteboardId]);

  useEffect(() => {
    const offSaved = onWhiteboardSaved((detail) => {
      if (
        detail.projectId !== projectId ||
        detail.whiteboardId !== whiteboardId
      ) {
        return;
      }
      setMissing(false);
      setDoc(normalizeWhiteboard(detail.document));
      setLoading(false);
    });
    const offDeleted = onWhiteboardDeleted((detail) => {
      if (
        detail.projectId !== projectId ||
        detail.whiteboardId !== whiteboardId
      ) {
        return;
      }
      setMissing(true);
      setDoc(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, whiteboardId]);

  const alignClass = embedAlignClass(textAlign);
  const { showWest, showEast } = embedResizeHandles(textAlign);

  const style: CSSProperties = {
    width: `${width}px`,
    maxWidth: "100%",
  };

  const selectEmbed = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (
        (e.target as HTMLElement | null)?.closest?.(
          "button, .rgd-embed-resize-handle",
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

  const openBoard = useCallback(() => {
    if (!whiteboardId || missing) return;
    extra.onOpenWhiteboard?.(whiteboardId);
  }, [extra, missing, whiteboardId]);

  return (
    <NodeViewWrapper
      className={
        missing
          ? `whiteboard-embed broken ${alignClass}`
          : `whiteboard-embed ${alignClass}`
      }
      data-type="whiteboard-embed"
      data-whiteboard-id={whiteboardId}
      data-whiteboard-name={doc?.name ?? whiteboardId}
      data-width={width}
      data-text-align={textAlign}
      style={style}
      onMouseDown={selectEmbed}
      onDoubleClick={(e: ReactMouseEvent<HTMLElement>) => {
        if (
          (e.target as HTMLElement | null)?.closest?.(".rgd-embed-resize-handle")
        ) {
          return;
        }
        openBoard();
      }}
      title={
        missing
          ? undefined
          : `${doc?.name ?? whiteboardId} — double-click to open in Whiteboard`
      }
    >
      {/* Drag handle on the image frame (no title chrome). */}
      <div className="whiteboard-embed-frame" data-drag-handle>
        {loading && <p className="muted tiny embed-status">Loading…</p>}
        {missing && (
          <p className="error embed-status">
            Broken embed — this whiteboard was deleted or never saved. Insert
            another from the toolbar.
          </p>
        )}
        {!missing && doc && !loading && (
          <WhiteboardPreview
            document={doc}
            compact
            className="whiteboard-embed-preview embed"
          />
        )}
      </div>
      {showWest && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize whiteboard width"
          aria-valuemin={WHITEBOARD_EMBED_MIN_WIDTH}
          aria-valuemax={WHITEBOARD_EMBED_MAX_WIDTH}
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
          aria-label="Resize whiteboard width"
          aria-valuemin={WHITEBOARD_EMBED_MIN_WIDTH}
          aria-valuemax={WHITEBOARD_EMBED_MAX_WIDTH}
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
