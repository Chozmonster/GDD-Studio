import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ChartEmbedView } from "./ChartEmbedView";

export type ChartEmbedOptions = {
  projectId: string;
  onOpenChart?: (chartId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

/** Default embed width — readable progression graph, not full editor width. */
export const CHART_EMBED_DEFAULT_WIDTH = 560;
export const CHART_EMBED_MIN_WIDTH = 280;
export const CHART_EMBED_MAX_WIDTH = 1200;

function parseEmbedWidth(raw: string | null): number {
  if (!raw) return CHART_EMBED_DEFAULT_WIDTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return CHART_EMBED_DEFAULT_WIDTH;
  return Math.min(
    CHART_EMBED_MAX_WIDTH,
    Math.max(CHART_EMBED_MIN_WIDTH, n),
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chartEmbed: {
      insertChartEmbed: (chartId: string) => ReturnType;
    };
  }
}

/**
 * TipTap node that stores a live reference to a project chart.
 *
 * Schema: { type: "chartEmbed", attrs: { chartId, width, textAlign } }
 * Table/series live on the Charts library — the document never snapshots them.
 */
export const ChartEmbed = Node.create<ChartEmbedOptions>({
  name: "chartEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenChart: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      chartId: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-chart-id") ?? "",
        renderHTML: (attributes) => ({
          "data-chart-id": attributes.chartId,
        }),
      },
      width: {
        default: CHART_EMBED_DEFAULT_WIDTH,
        parseHTML: (element) =>
          parseEmbedWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({
          "data-width": String(
            attributes.width ?? CHART_EMBED_DEFAULT_WIDTH,
          ),
        }),
      },
      textAlign: {
        default: "left",
        parseHTML: (element) => {
          const fromData = element.getAttribute("data-text-align");
          if (
            fromData === "left" ||
            fromData === "center" ||
            fromData === "right" ||
            fromData === "justify"
          ) {
            return fromData;
          }
          const fromStyle = element.style?.textAlign;
          if (
            fromStyle === "left" ||
            fromStyle === "center" ||
            fromStyle === "right" ||
            fromStyle === "justify"
          ) {
            return fromStyle;
          }
          return "left";
        },
        renderHTML: (attributes) => {
          const align = attributes.textAlign || "left";
          return {
            "data-text-align": align,
            style: `text-align: ${align}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "chart-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertChartEmbed:
        (chartId: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { chartId },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartEmbedView);
  },
});
