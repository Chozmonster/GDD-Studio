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

/** Default embed width — readable, not forced full editor width. */
export const MEDIA_EMBED_DEFAULT_WIDTH = 560;
export const MEDIA_EMBED_MIN_WIDTH = 160;
export const MEDIA_EMBED_MAX_WIDTH = 1200;

export function parseMediaEmbedWidth(raw: string | null): number {
  if (!raw) return MEDIA_EMBED_DEFAULT_WIDTH;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return MEDIA_EMBED_DEFAULT_WIDTH;
  return Math.min(
    MEDIA_EMBED_MAX_WIDTH,
    Math.max(MEDIA_EMBED_MIN_WIDTH, n),
  );
}

/** Shared textAlign attr for atom media embeds (media + mood board). */
export const mediaEmbedTextAlignAttribute = {
  default: "left" as const,
  parseHTML: (element: HTMLElement) => {
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
  renderHTML: (attributes: Record<string, unknown>) => {
    const align = String(attributes.textAlign || "left");
    return {
      "data-text-align": align,
      style: `text-align: ${align}`,
    };
  },
};

export const mediaEmbedWidthAttribute = {
  default: MEDIA_EMBED_DEFAULT_WIDTH,
  parseHTML: (element: HTMLElement) =>
    parseMediaEmbedWidth(element.getAttribute("data-width")),
  renderHTML: (attributes: Record<string, unknown>) => ({
    "data-width": String(attributes.width ?? MEDIA_EMBED_DEFAULT_WIDTH),
  }),
};

/**
 * Block media embed. Schema:
 * { type: "mediaEmbed", attrs: { assetId, kind, filename, mime, width, textAlign } }
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
      width: mediaEmbedWidthAttribute,
      // Declared on the node (not only via TextAlign globals) so JSON
      // round-trips keep left/center/right for this atom embed.
      textAlign: mediaEmbedTextAlignAttribute,
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
