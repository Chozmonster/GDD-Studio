import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { DocVariable } from "../../types";
import { VariableEmbedView } from "./VariableEmbedView";

export type VariableEmbedOptions = {
  projectId: string;
  /**
   * Resolve or create a project variable when the user types `{{name}}`.
   * Should persist + notify listeners; returns the canonical record.
   */
  ensureVariable?: (name: string) => Promise<DocVariable>;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    variableEmbed: {
      insertVariableEmbed: (variableId: string, name: string) => ReturnType;
    };
  }
}

function normalizeTypedName(raw: string): string {
  return raw.trim().replace(/\s+/g, "_").slice(0, 48);
}

/**
 * Inline live reference to a project documentation variable.
 * Typed as {{variablename}} (mirrors [[Doc Title]] wiki links).
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
      ensureVariable: undefined,
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

  addInputRules() {
    return [
      new InputRule({
        find: /\{\{([^{}]+)\}\}$/,
        handler: ({ range, match, chain }) => {
          const name = normalizeTypedName(match[1] ?? "");
          if (!name) return;
          chain()
            .deleteRange(range)
            .insertContent({
              type: this.name,
              attrs: { variableId: "", name },
            })
            .run();
          void this.options.ensureVariable?.(name);
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableEmbedView);
  },
});
