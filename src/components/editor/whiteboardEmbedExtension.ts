import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { WhiteboardEmbedView } from "./WhiteboardEmbedView";

export type WhiteboardEmbedOptions = {
  projectId: string;
  onOpenWhiteboard?: (whiteboardId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

/** Default embed width — readable doodle, not full editor width. */
export const WHITEBOARD_EMBED_DEFAULT_WIDTH = 560;
export const WHITEBOARD_EMBED_MIN_WIDTH = 280;
export const WHITEBOARD_EMBED_MAX_WIDTH = 1200;

function parseEmbedWidth(raw: string | null): number {
  if (!raw) return WHITEBOARD_EMBED_DEFAULT_WIDTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return WHITEBOARD_EMBED_DEFAULT_WIDTH;
  return Math.min(
    WHITEBOARD_EMBED_MAX_WIDTH,
    Math.max(WHITEBOARD_EMBED_MIN_WIDTH, n),
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    whiteboardEmbed: {
      insertWhiteboardEmbed: (whiteboardId: string) => ReturnType;
    };
  }
}

/**
 * TipTap node that stores a live reference to a project whiteboard.
 *
 * Schema: { type: "whiteboardEmbed", attrs: { whiteboardId, width, textAlign } }
 * Strokes/shapes live on the Whiteboard library — the document never snapshots them.
 */
export const WhiteboardEmbed = Node.create<WhiteboardEmbedOptions>({
  name: "whiteboardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenWhiteboard: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      whiteboardId: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-whiteboard-id") ?? "",
        renderHTML: (attributes) => ({
          "data-whiteboard-id": attributes.whiteboardId,
        }),
      },
      width: {
        default: WHITEBOARD_EMBED_DEFAULT_WIDTH,
        parseHTML: (element) =>
          parseEmbedWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({
          "data-width": String(
            attributes.width ?? WHITEBOARD_EMBED_DEFAULT_WIDTH,
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
    return [{ tag: 'div[data-type="whiteboard-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "whiteboard-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertWhiteboardEmbed:
        (whiteboardId: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { whiteboardId },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(WhiteboardEmbedView);
  },
});
