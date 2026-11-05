import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  defaultPayload,
  defaultTitle,
  serializePayload,
} from "./rgdContent";
import { RgdBlockView } from "./RgdBlockView";
import type { RgdBlockType } from "./rgdTypes";
import { RGD_INSERT_ORDER } from "./rgdTypes";

export type RgdBlockOptions = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
  HTMLAttributes: Record<string, unknown>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    rgdBlock: {
      insertRgdBlock: (rgdType: RgdBlockType, title?: string) => ReturnType;
      insertRgdSkeleton: () => ReturnType;
    };
  }
}

/**
 * Structured Rational Game Design section persisted in TipTap JSON.
 *
 * Schema:
 *   {
 *     type: "rgdBlock",
 *     attrs: {
 *       rgdType: RgdBlockType,
 *       title: string,
 *       payload: string // JSON blob for type-specific fields
 *     }
 *   }
 */
export const RgdBlock = Node.create<RgdBlockOptions>({
  name: "rgdBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      projectId: "",
      onOpenFlowchart: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      rgdType: {
        default: "pillars" satisfies RgdBlockType,
        parseHTML: (el) =>
          (el.getAttribute("data-rgd-type") as RgdBlockType) ?? "pillars",
        renderHTML: (attrs) => ({
          "data-rgd-type": attrs.rgdType,
        }),
      },
      title: {
        default: defaultTitle("pillars"),
        parseHTML: (el) => el.getAttribute("data-rgd-title") ?? "",
        renderHTML: (attrs) => ({
          "data-rgd-title": attrs.title,
        }),
      },
      payload: {
        default: serializePayload(defaultPayload("pillars")),
        parseHTML: (el) => el.getAttribute("data-rgd-payload") ?? "",
        renderHTML: (attrs) => ({
          "data-rgd-payload": attrs.payload,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="rgd-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "rgd-block",
      }),
    ];
  },

  addCommands() {
    return {
      insertRgdBlock:
        (rgdType: RgdBlockType, title?: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              rgdType,
              title: title ?? defaultTitle(rgdType),
              payload: serializePayload(defaultPayload(rgdType)),
            },
          }),
      insertRgdSkeleton:
        () =>
        ({ commands }) =>
          commands.insertContent(
            RGD_INSERT_ORDER.map((rgdType) => ({
              type: this.name,
              attrs: {
                rgdType,
                title: defaultTitle(rgdType),
                payload: serializePayload(defaultPayload(rgdType)),
              },
            })),
          ),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(RgdBlockView);
  },
});
