import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { slugifyHeading } from "./documentOutline";
import { WikiLinkView } from "./WikiLinkView";

export type WikiLinkOptions = {
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      /** Insert an in-document section link (heading target). */
      insertWikiLink: (attrs: {
        title: string;
        slug?: string;
        /** @deprecated Ignored — section links stay in-document. */
        docId?: string;
      }) => ReturnType;
      insertSectionLink: (attrs: {
        title: string;
        slug?: string;
      }) => ReturnType;
    };
  }
}

/**
 * In-document section link. Typed as [[Heading text]] or [[slug|Label]].
 * TipTap node name remains `wikiLink` so existing project JSON keeps loading.
 * Schema: { type: "wikiLink", attrs: { title, slug, docId } }
 * — `docId` is ignored; title/slug resolve against headings in the open doc.
 */
export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
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
              slug: attrs.slug ?? slugifyHeading(attrs.title),
              docId: "",
            },
          }),
      insertSectionLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: attrs.title,
              slug: attrs.slug ?? slugifyHeading(attrs.title),
              docId: "",
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
            slug = slugifyHeading(raw);
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
