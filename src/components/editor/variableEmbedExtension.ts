import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { VariableEmbedView } from "./VariableEmbedView";

export type VariableEmbedOptions = {
  projectId: string;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variableEmbed: {
      insertVariableEmbed: (variableId: string, name: string) => ReturnType;
    };
  }
}

/**
 * Inline live reference to a project documentation variable.
 * Schema: { type: "variableEmbed", attrs: { variableId, name } }
 */
export const VariableEmbed = Node.create<VariableEmbedOptions>({
  name: "variableEmbed",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      variableId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-variable-id") ?? "",
        renderHTML: (attrs) => ({
          "data-variable-id": attrs.variableId,
        }),
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-variable-name") ?? "",
        renderHTML: (attrs) => ({
          "data-variable-name": attrs.name,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="variable-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "variable-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertVariableEmbed:
        (variableId: string, name: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { variableId, name },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableEmbedView);
  },
});
