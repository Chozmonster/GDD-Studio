import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { WikiLinkView } from "./WikiLinkView";

export type WikiLinkOptions = {
  projectId: string;
  onOpenDoc?: (docId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (attrs: {
        title: string;
        slug?: string;
        docId?: string;
      }) => ReturnType;
    };
  }
}

/**
 * Inline wiki link. Typed as [[Title]] or [[slug|Label]].
 * Schema: { type: "wikiLink", attrs: { title, slug, docId } }
 */
export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenDoc: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
      slug: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-slug") ?? "",
        renderHTML: (attrs) => ({ "data-slug": attrs.slug }),
      },
      docId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-doc-id") ?? "",
        renderHTML: (attrs) => ({ "data-doc-id": attrs.docId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "wiki-link",
      }),
    ];
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attrs.title,
              slug: attrs.slug ?? "",
              docId: attrs.docId ?? "",
            },
          }),
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]]+)\]\]$/,
        handler: ({ range, match, chain }) => {
          const raw = match[1]?.trim() ?? "";
          if (!raw) return;
          let title = raw;
          let slug = "";
          if (raw.includes("|")) {
            const [left, right] = raw.split("|", 2);
            slug = left.trim();
            title = (right ?? left).trim();
          } else {
            title = raw;
            slug = raw
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");
          }
          chain()
            .deleteRange(range)
            .insertContent({
              type: this.name,
              attrs: { title, slug, docId: "" },
            })
            .run();
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkView);
  },
});
