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
import { getAssetSrc } from "../../api";
import {
  MEDIA_EMBED_DEFAULT_WIDTH,
  MEDIA_EMBED_MAX_WIDTH,
  MEDIA_EMBED_MIN_WIDTH,
} from "./mediaEmbedExtension";

type ExtraProps = {
  projectId: string;
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
  const textAlign = normalizeAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [src, setSrc] = useState<string | null>(null);
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
