import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { getAssetSrc } from "../../api";

type ExtraProps = {
  projectId: string;
};

export function MediaEmbedView(props: NodeViewProps) {
  const assetId = String(props.node.attrs.assetId ?? "");
  const kind = String(props.node.attrs.kind ?? "image");
  const filename = String(props.node.attrs.filename ?? "");
  const mime = String(props.node.attrs.mime ?? "");
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const label = filename || kind;

  return (
    <NodeViewWrapper
      className={`media-embed media-embed-${kind}`}
      data-drag-handle
      contentEditable={false}
    >
      <div className="media-embed-chrome">
        <span className="media-embed-kind">{kind}</span>
        <span className="media-embed-name" title={label}>
          {label}
        </span>
      </div>
      {error && <p className="media-embed-error muted tiny">{error}</p>}
      {!error && !src && <p className="muted tiny">Loading media…</p>}
      {src && (kind === "image" || kind === "gif") && (
        <img className="media-embed-img" src={src} alt={label} draggable={false} />
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
        <audio className="media-embed-audio" src={src} controls preload="metadata">
          {mime ? `Unsupported audio (${mime})` : "Unsupported audio"}
        </audio>
      )}
    </NodeViewWrapper>
  );
}
