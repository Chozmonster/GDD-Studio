/**
 * Live chart embed — subscribes to chart save/delete events so the Document
 * tab never shows a stale progression graph after Charts tab edits.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { chartExists, loadChart } from "../../api";
import { onChartDeleted, onChartSaved } from "../../lib/chartEvents";
import type { ChartDocument } from "../../types";
import { ChartPreview } from "../charts/ChartPreview";
import { normalizeChart } from "../charts/chartModel";
import {
  CHART_EMBED_DEFAULT_WIDTH,
  CHART_EMBED_MAX_WIDTH,
  CHART_EMBED_MIN_WIDTH,
} from "./chartEmbedExtension";
import {
  embedAlignClass,
  embedResizeHandles,
  normalizeEmbedAlign,
  useEmbedWidthResize,
} from "./useEmbedWidthResize";

type ExtraProps = {
  projectId: string;
  onOpenChart?: (chartId: string) => void;
};

export function ChartEmbedView(props: NodeViewProps) {
  const chartId = String(props.node.attrs.chartId ?? "");
  const attrWidth = Number(props.node.attrs.width);
  const storedWidth =
    Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : CHART_EMBED_DEFAULT_WIDTH;
  const textAlign = normalizeEmbedAlign(props.node.attrs.textAlign);
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [doc, setDoc] = useState<ChartDocument | null>(null);
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
      min: CHART_EMBED_MIN_WIDTH,
      max: CHART_EMBED_MAX_WIDTH,
      defaultWidth: CHART_EMBED_DEFAULT_WIDTH,
    },
    updateWidth,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (!chartId) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const exists = await chartExists(projectId, chartId);
        // Main may not exist on disk yet — load still returns an empty chart.
        if (!exists && chartId !== "main") {
          // Still try load — empty factory charts count as present until deleted.
          try {
            const loaded = normalizeChart(await loadChart(projectId, chartId));
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
        const loaded = normalizeChart(await loadChart(projectId, chartId));
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
  }, [projectId, chartId]);

  useEffect(() => {
    const offSaved = onChartSaved((detail) => {
      if (detail.projectId !== projectId || detail.chartId !== chartId) return;
      setMissing(false);
      setDoc(normalizeChart(detail.document));
      setLoading(false);
    });
    const offDeleted = onChartDeleted((detail) => {
      if (detail.projectId !== projectId || detail.chartId !== chartId) return;
      setMissing(true);
      setDoc(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, chartId]);

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

  return (
    <NodeViewWrapper
      className={
        missing
          ? `chart-embed broken ${alignClass}`
          : `chart-embed ${alignClass}`
      }
      data-type="chart-embed"
      data-chart-id={chartId}
      data-width={width}
      data-text-align={textAlign}
      style={style}
      onMouseDown={selectEmbed}
    >
      <div className="chart-embed-chrome" data-drag-handle>
        <span className="chart-embed-badge">Chart</span>
        <div className="chart-embed-text">
          <span className="chart-embed-title">
            {missing
              ? `Missing chart “${chartId || "?"}”`
              : (doc?.name ?? chartId)}
          </span>
          {!missing && doc?.description?.trim() ? (
            <span className="muted tiny chart-embed-description">
              {doc.description}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="ghost tiny-btn"
          disabled={missing || !chartId}
          onClick={() => chartId && extra.onOpenChart?.(chartId)}
        >
          Open in Graph
        </button>
      </div>
      {loading && <p className="muted tiny embed-status">Loading…</p>}
      {missing && (
        <p className="error embed-status">
          Broken embed — this graph was deleted or never saved. Insert another
          from the toolbar.
        </p>
      )}
      {!missing && doc && !loading && (
        <ChartPreview document={doc} compact className="chart-embed-preview" />
      )}
      {showWest && (
        <span
          className="rgd-embed-resize-handle rgd-embed-resize-w"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chart width"
          aria-valuemin={CHART_EMBED_MIN_WIDTH}
          aria-valuemax={CHART_EMBED_MAX_WIDTH}
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
          aria-label="Resize chart width"
          aria-valuemin={CHART_EMBED_MIN_WIDTH}
          aria-valuemax={CHART_EMBED_MAX_WIDTH}
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
