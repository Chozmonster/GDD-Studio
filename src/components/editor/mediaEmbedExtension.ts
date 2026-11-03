import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaEmbedView } from "./MediaEmbedView";

export type MediaEmbedOptions = {
  projectId: string;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mediaEmbed: {
      insertMediaEmbed: (attrs: {
        assetId: string;
        kind: string;
        filename?: string;
        mime?: string;
      }) => ReturnType;
    };
  }
}

/**
 * Block media embed. Schema:
 * { type: "mediaEmbed", attrs: { assetId, kind, filename, mime } }
 * Binary lives in the project asset store — not inlined in the JSON body.
 */
export const MediaEmbed = Node.create<MediaEmbedOptions>({
  name: "mediaEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      assetId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-asset-id") ?? "",
        renderHTML: (attrs) => ({ "data-asset-id": attrs.assetId }),
      },
      kind: {
        default: "image",
        parseHTML: (el) => el.getAttribute("data-kind") ?? "image",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
      filename: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-filename") ?? "",
        renderHTML: (attrs) => ({ "data-filename": attrs.filename }),
      },
      mime: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mime") ?? "",
        renderHTML: (attrs) => ({ "data-mime": attrs.mime }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="media-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "media-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertMediaEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedView);
  },
});
