/**
 * Live RGD sheet table embed — subscribes to sheet save/delete events so the
 * Document tab never shows a stale mechanic table after RGD workspace edits.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { loadRgdSheet, rgdSheetExists } from "../../../api";
import { onRgdSheetDeleted, onRgdSheetSaved } from "../../../lib/rgdEvents";
import type { RgdSheetDocument } from "../../../types";
import {
  embedAlignClass,
  embedResizeHandles,
  normalizeEmbedAlign,
  useEmbedWidthResize,
} from "../useEmbedWidthResize";
import { RgdLiveTable } from "./RgdLiveTable";
import {
  RGD_TABLE_EMBED_DEFAULT_WIDTH,
  RGD_TABLE_EMBED_MAX_WIDTH,
  RGD_TABLE_EMBED_MIN_WIDTH,
} from "./rgdSheetEmbedExtension";
import { normalizeRgdSheet } from "./rgdSheetModel";
import { parseMechanics } from "./rgdTableModel";

type ExtraProps = {
  projectId: string;
  onOpenRgdSheet?: (sheetId: string) => void;
};

export function RgdSheetEmbedView(props: NodeViewProps) {
  const sheetId = String(props.node.attrs.sheetId ?? "");
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : RGD_TABLE_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeEmbedAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [doc, setDoc] = useState<RgdSheetDocument | null>(null);
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
      min: RGD_TABLE_EMBED_MIN_WIDTH,
      max: RGD_TABLE_EMBED_MAX_WIDTH,
      defaultWidth: RGD_TABLE_EMBED_DEFAULT_WIDTH,
    },
    updateWidth,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (!sheetId) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const exists = await rgdSheetExists(projectId, sheetId);
        if (!exists) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const loaded = normalizeRgdSheet(
          await loadRgdSheet(projectId, sheetId),
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
  }, [projectId, sheetId]);

  useEffect(() => {
    const offSaved = onRgdSheetSaved((detail) => {
      if (detail.projectId !== projectId || detail.sheetId !== sheetId) return;
      setMissing(false);
      setDoc(normalizeRgdSheet(detail.document));
      setLoading(false);
    });
    const offDeleted = onRgdSheetDeleted((detail) => {
      if (detail.projectId !== projectId || detail.sheetId !== sheetId) return;
      setMissing(true);
      setDoc(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, sheetId]);

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
      // Select the atom explicitly so the align toolbar can target it.
      e.preventDefault();
      props.editor.chain().setNodeSelection(pos).focus().run();
    },
    [props],
  );

  return (
    <NodeViewWrapper
      className={
        missing
          ? `rgd-sheet-card rgd-table-embed broken ${alignClass}`
          : `rgd-sheet-card rgd-table-embed ${alignClass}`
      }
      data-sheet-id={sheetId}
      data-width={width}
      data-text-align={textAlign}
      style={style}
      onMouseDown={selectEmbed}
    >
      <div className="rgd-sheet-card-chrome" data-drag-handle>
        <span className="rgd-step-badge">RGD</span>
        <div className="rgd-sheet-card-text">
          <span className="rgd-sheet-card-title">
            {missing
              ? `Missing sheet “${sheetId || "?"}”`
              : (doc?.name ?? sheetId)}
          </span>
          {!missing && !loading && doc && (
            <span className="muted tiny rgd-sheet-card-summary">
              Live mechanic table
            </span>
          )}
        </div>
        <button
          type="button"
          className="ghost tiny-btn"
          disabled={missing || !sheetId}
          onClick={() => sheetId && extra.onOpenRgdSheet?.(sheetId)}
        >
          Open in RGD
        </button>
      </div>
      {loading && <p className="muted tiny embed-status">Loading…</p>}
      {missing && (
        <p className="error embed-status">
          Broken embed — this RGD sheet was deleted or never saved. Insert
          another from the toolbar.
        </p>
      )}
      {!missing && doc && !loading && (
        <RgdLiveTable
          title={doc.name}
          mechanics={parseMechanics(doc.mechanics)}
          className="rgd-embed-table"
        />
      )}
      {showWest && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize RGD table width"
          aria-valuemin={RGD_TABLE_EMBED_MIN_WIDTH}
          aria-valuemax={RGD_TABLE_EMBED_MAX_WIDTH}
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
          aria-label="Resize RGD table width"
          aria-valuemin={RGD_TABLE_EMBED_MIN_WIDTH}
          aria-valuemax={RGD_TABLE_EMBED_MAX_WIDTH}
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
