import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { getAssetSrc } from "../../api";
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
};

export function MediaEmbedView(props: NodeViewProps) {
  const assetId = String(props.node.attrs.assetId ?? "");
  const kind = String(props.node.attrs.kind ?? "image");
  const filename = String(props.node.attrs.filename ?? "");
  const mime = String(props.node.attrs.mime ?? "");
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : MEDIA_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeEmbedAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setSrc(null);
    setError(null);
    if (!assetId || !projectId) {
      setError("Missing asset");
      return;
    }
    void getAssetSrc(projectId, assetId)
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
  }, [projectId, assetId]);

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

  const label = filename || kind;

  return (
    <NodeViewWrapper
      className={`media-embed media-embed-${kind} ${alignClass}`}
      data-asset-id={assetId}
      data-width={width}
      data-text-align={textAlign}
      style={style}
      contentEditable={false}
      onMouseDown={selectEmbed}
    >
      <div className="media-embed-chrome" data-drag-handle>
        <span className="media-embed-kind">{kind}</span>
        <span className="media-embed-name" title={label}>
          {label}
        </span>
      </div>
      {error && <p className="media-embed-error muted tiny">{error}</p>}
      {!error && !src && <p className="muted tiny">Loading media…</p>}
      {src && (kind === "image" || kind === "gif") && (
        <img
          className="media-embed-img"
          src={src}
          alt={label}
          draggable={false}
        />
      )}
      {src && kind === "video" && (
        <video
          className="media-embed-video"
          src={src}
          controls
          playsInline
          preload="metadata"
        >
          <track kind="captions" />
        </video>
      )}
      {src && kind === "audio" && (
        <audio
          className="media-embed-audio"
          src={src}
          controls
          preload="metadata"
        >
          {mime ? `Unsupported audio (${mime})` : "Unsupported audio"}
        </audio>
      )}
      {showWest && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize media width"
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
          aria-label="Resize media width"
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
