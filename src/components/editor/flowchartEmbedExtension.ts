import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FlowchartEmbedView } from "./FlowchartEmbedView";

export type FlowchartEmbedOptions = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

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
 *   { type: "flowchartEmbed", attrs: { flowchartId: string } }
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
