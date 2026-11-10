import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FlowchartEmbedView } from "./FlowchartEmbedView";

export type FlowchartEmbedOptions = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

/** Default embed width — readable live preview, not forced full editor width. */
export const FLOWCHART_EMBED_DEFAULT_WIDTH = 560;
export const FLOWCHART_EMBED_MIN_WIDTH = 280;
export const FLOWCHART_EMBED_MAX_WIDTH = 1200;

function parseEmbedWidth(raw: string | null): number {
  if (!raw) return FLOWCHART_EMBED_DEFAULT_WIDTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return FLOWCHART_EMBED_DEFAULT_WIDTH;
  return Math.min(
    FLOWCHART_EMBED_MAX_WIDTH,
    Math.max(FLOWCHART_EMBED_MIN_WIDTH, n),
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    flowchartEmbed: {
      insertFlowchartEmbed: (flowchartId: string) => ReturnType;
    };
  }
}

/**
 * TipTap node that stores a live reference to a project flowchart.
 *
 * Schema (JSON attrs):
 *   { type: "flowchartEmbed", attrs: { flowchartId, width, textAlign } }
 *
 * The document does not snapshot nodes/edges — embeds reload from the
 * project flowchart store and subscribe to flowchart:saved events.
 */
export const FlowchartEmbed = Node.create<FlowchartEmbedOptions>({
  name: "flowchartEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenFlowchart: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      flowchartId: {
        default: "main",
        parseHTML: (element) =>
          element.getAttribute("data-flowchart-id") ?? "main",
        renderHTML: (attributes) => ({
          "data-flowchart-id": attributes.flowchartId,
        }),
      },
      width: {
        default: FLOWCHART_EMBED_DEFAULT_WIDTH,
        parseHTML: (element) =>
          parseEmbedWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({
          "data-width": String(
            attributes.width ?? FLOWCHART_EMBED_DEFAULT_WIDTH,
          ),
        }),
      },
      // Declared on the node (not only via TextAlign globals) so JSON
      // round-trips keep left/center/right for this atom embed.
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
    return [{ tag: 'div[data-type="flowchart-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "flowchart-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertFlowchartEmbed:
        (flowchartId: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { flowchartId },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlowchartEmbedView);
  },
});
