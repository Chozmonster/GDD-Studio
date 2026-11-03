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

/**
 * TipTap node that stores a live reference to a project RGD sheet.
 *
 * Schema: { type: "rgdSheetEmbed", attrs: { sheetId: string } }
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
