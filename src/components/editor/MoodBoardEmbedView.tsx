import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { getAssetSrc, listAssets, loadMoodBoard } from "../../api";
import {
  onMoodBoardItemDeleted,
  onMoodBoardSaved,
} from "../../lib/moodBoardEvents";
import type { AssetRecord, MoodBoardItem } from "../../types";
import { MoodMediaFrame } from "../moodboard/MoodMediaFrame";

type ExtraProps = {
  projectId: string;
  onOpenMoodBoard?: () => void;
};

export function MoodBoardEmbedView(props: NodeViewProps) {
  const itemId = String(props.node.attrs.moodBoardItemId ?? "");
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [item, setItem] = useState<MoodBoardItem | null>(null);
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const kind = String(asset?.kind ?? "image");
  const label = asset?.filename || itemId;
  const comment = item?.comment?.trim() ?? "";

  return (
    <NodeViewWrapper
      className={
        missing
          ? "mood-board-embed media-embed broken"
          : "mood-board-embed media-embed"
      }
      data-drag-handle
      data-type="mood-board-embed"
      data-mood-board-item-id={itemId}
      contentEditable={false}
    >
      <div className="media-embed-chrome mood-board-embed-chrome">
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
    </NodeViewWrapper>
  );
}
