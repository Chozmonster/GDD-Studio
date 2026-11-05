import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { RgdSheetEmbedView } from "./RgdSheetEmbedView";

export type RgdSheetEmbedOptions = {
  projectId: string;
  onOpenRgdSheet?: (sheetId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    rgdSheetEmbed: {
      insertRgdSheetEmbed: (sheetId: string) => ReturnType;
    };
  }
}

/** Default embed width — readable, not forced full editor width. */
export const RGD_TABLE_EMBED_DEFAULT_WIDTH = 560;
export const RGD_TABLE_EMBED_MIN_WIDTH = 280;
export const RGD_TABLE_EMBED_MAX_WIDTH = 1200;

function parseEmbedWidth(raw: string | null): number {
  if (!raw) return RGD_TABLE_EMBED_DEFAULT_WIDTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return RGD_TABLE_EMBED_DEFAULT_WIDTH;
  return Math.min(
    RGD_TABLE_EMBED_MAX_WIDTH,
    Math.max(RGD_TABLE_EMBED_MIN_WIDTH, n),
  );
}

/**
 * TipTap node that stores a live reference to a project RGD sheet.
 *
 * Schema: { type: "rgdSheetEmbed", attrs: { sheetId, width } }
 * `textAlign` comes from the TextAlign extension (types include this node).
 */
export const RgdSheetEmbed = Node.create<RgdSheetEmbedOptions>({
  name: "rgdSheetEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenRgdSheet: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      sheetId: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-rgd-sheet-id") ?? "",
        renderHTML: (attributes) => ({
          "data-rgd-sheet-id": attributes.sheetId,
        }),
      },
      width: {
        default: RGD_TABLE_EMBED_DEFAULT_WIDTH,
        parseHTML: (element) =>
          parseEmbedWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({
          "data-width": String(
            attributes.width ?? RGD_TABLE_EMBED_DEFAULT_WIDTH,
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
    return [{ tag: 'div[data-type="rgd-sheet-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "rgd-sheet-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertRgdSheetEmbed:
        (sheetId: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { sheetId },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(RgdSheetEmbedView);
  },
});
