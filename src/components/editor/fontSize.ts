import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Applies `font-size` via TextStyle marks (pairs with FontFamily). */
export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) =>
              element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

export const FONT_SIZE_OPTIONS = [
  { label: "Small", value: "0.9rem" },
  { label: "Body", value: "1.05rem" },
  { label: "Large", value: "1.25rem" },
  { label: "Title", value: "1.6rem" },
] as const;

export const FONT_FAMILY_OPTIONS = [
  { label: "Document", value: "Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif" },
  { label: "UI Sans", value: "Segoe UI, Helvetica Neue, sans-serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
] as const;
