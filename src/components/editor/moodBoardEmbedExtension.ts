import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  mediaEmbedTextAlignAttribute,
  mediaEmbedWidthAttribute,
} from "./mediaEmbedExtension";
import { MoodBoardEmbedView } from "./MoodBoardEmbedView";

export type MoodBoardEmbedOptions = {
  projectId: string;
  onOpenMoodBoard?: (boardId?: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    moodBoardEmbed: {
      insertMoodBoardEmbed: (
        moodBoardItemId: string,
        moodBoardId?: string,
      ) => ReturnType;
    };
  }
}

/**
 * TipTap node that stores a live reference to a Mood Board item.
 *
 * Schema:
 *   { type: "moodBoardEmbed", attrs: { moodBoardId, moodBoardItemId, width, textAlign } }
 *
 * Crop, border, comment, and asset binding live on the Mood Board item —
 * the document never snapshots those edits. Width/align are document-local.
 * Legacy embeds without moodBoardId resolve the item across boards (prefer main).
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
      moodBoardId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mood-board-id") ?? "",
        renderHTML: (attrs) =>
          attrs.moodBoardId
            ? { "data-mood-board-id": attrs.moodBoardId }
            : {},
      },
      moodBoardItemId: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-mood-board-item-id") ?? "",
        renderHTML: (attrs) => ({
          "data-mood-board-item-id": attrs.moodBoardItemId,
        }),
      },
      width: mediaEmbedWidthAttribute,
      textAlign: mediaEmbedTextAlignAttribute,
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
        (moodBoardItemId: string, moodBoardId = "main") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { moodBoardItemId, moodBoardId },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MoodBoardEmbedView);
  },
});
