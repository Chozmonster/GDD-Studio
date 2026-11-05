import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MoodBoardEmbedView } from "./MoodBoardEmbedView";

export type MoodBoardEmbedOptions = {
  projectId: string;
  onOpenMoodBoard?: () => void;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    moodBoardEmbed: {
      insertMoodBoardEmbed: (moodBoardItemId: string) => ReturnType;
    };
  }
}

/**
 * TipTap node that stores a live reference to a Mood Board item.
 *
 * Schema:
 *   { type: "moodBoardEmbed", attrs: { moodBoardItemId: string } }
 *
 * Crop, border, comment, and asset binding live on the Mood Board item —
 * the document never snapshots those edits.
 */
export const MoodBoardEmbed = Node.create<MoodBoardEmbedOptions>({
  name: "moodBoardEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenMoodBoard: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      moodBoardItemId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mood-board-item-id") ?? "",
        renderHTML: (attrs) => ({
          "data-mood-board-item-id": attrs.moodBoardItemId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mood-board-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "mood-board-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertMoodBoardEmbed:
        (moodBoardItemId: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { moodBoardItemId },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MoodBoardEmbedView);
  },
});
