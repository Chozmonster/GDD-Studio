/**
 * Live flowchart embed — listens for flowchart save/delete events so Document
 * previews stay in sync with the Flowcharts tab without a page reload.
 * Width + textAlign mirror media / RGD / Graph embeds (shared resize hook).
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  flowchartExists,
  loadFlowchart,
} from "../../api";
import {
  onFlowchartDeleted,
  onFlowchartSaved,
} from "../../lib/flowchartEvents";
import type { FlowchartDocument } from "../../types";
import { FlowchartPreview } from "../flowchart/FlowchartPreview";
import {
  FLOWCHART_EMBED_DEFAULT_WIDTH,
  FLOWCHART_EMBED_MAX_WIDTH,
  FLOWCHART_EMBED_MIN_WIDTH,
} from "./flowchartEmbedExtension";
import {
  embedAlignClass,
  embedResizeHandles,
  normalizeEmbedAlign,
  useEmbedWidthResize,
} from "./useEmbedWidthResize";

type ExtraProps = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
};

export function FlowchartEmbedView(props: NodeViewProps) {
  const flowchartId = String(props.node.attrs.flowchartId ?? "main");
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : FLOWCHART_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeEmbedAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [doc, setDoc] = useState<FlowchartDocument | null>(null);
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
      min: FLOWCHART_EMBED_MIN_WIDTH,
      max: FLOWCHART_EMBED_MAX_WIDTH,
      defaultWidth: FLOWCHART_EMBED_DEFAULT_WIDTH,
    },
    updateWidth,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const exists = await flowchartExists(projectId, flowchartId);
        if (!exists) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const loaded = await loadFlowchart(projectId, flowchartId);
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
  }, [projectId, flowchartId]);

  useEffect(() => {
    const offSaved = onFlowchartSaved((detail) => {
      if (detail.projectId !== projectId || detail.flowchartId !== flowchartId) {
        return;
      }
      setMissing(false);
      setDoc(detail.document);
      setLoading(false);
    });
    const offDeleted = onFlowchartDeleted((detail) => {
      if (detail.projectId !== projectId || detail.flowchartId !== flowchartId) {
        return;
      }
      setMissing(true);
      setDoc(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, flowchartId]);

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
          ? `flowchart-embed broken ${alignClass}`
          : `flowchart-embed ${alignClass}`
      }
      data-flowchart-id={flowchartId}
      data-width={width}
      data-text-align={textAlign}
      style={style}
      onMouseDown={selectEmbed}
    >
      <div className="flowchart-embed-chrome" data-drag-handle>
        <span className="flowchart-embed-title">
          {missing
            ? `Missing flowchart “${flowchartId}”`
            : `Flowchart: ${doc?.name ?? flowchartId}`}
        </span>
        <button
          type="button"
          className="ghost"
          disabled={missing}
          onClick={() => extra.onOpenFlowchart?.(flowchartId)}
        >
          Open editor
        </button>
      </div>
      {loading && <p className="muted tiny embed-status">Loading preview…</p>}
      {missing && (
        <p className="error embed-status">
          Broken embed — this flowchart was deleted or never saved. Insert another
          from the toolbar.
        </p>
      )}
      {!missing && doc && (
        <>
          <FlowchartPreview document={doc} className="flowchart-preview embed" />
          {doc.description?.trim() ? (
            <p className="flowchart-embed-description">{doc.description}</p>
          ) : null}
        </>
      )}
      {showWest && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize flowchart width"
          aria-valuemin={FLOWCHART_EMBED_MIN_WIDTH}
          aria-valuemax={FLOWCHART_EMBED_MAX_WIDTH}
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
          aria-label="Resize flowchart width"
          aria-valuemin={FLOWCHART_EMBED_MIN_WIDTH}
          aria-valuemax={FLOWCHART_EMBED_MAX_WIDTH}
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
