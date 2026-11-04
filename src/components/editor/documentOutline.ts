import type { Editor } from "@tiptap/react";
import { parsePayload, RGD_EXPAND_EVENT } from "./rgd/rgdContent";
import type { RgdBlockType } from "./rgd/rgdTypes";
import { RGD_TYPE_META } from "./rgd/rgdTypes";

export type OutlineItem = {
  id: string;
  kind: "heading" | "rgd" | "rgdSheet";
  level: number;
  text: string;
  pos: number;
  rgdType?: RgdBlockType;
};

export function slugifyHeading(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function collectOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level ?? 1);
      const text = node.textContent.trim() || `Heading ${level}`;
      items.push({
        id: `h-${pos}-${level}`,
        kind: "heading",
        level,
        text,
        pos,
      });
      return;
    }
    if (node.type.name === "rgdSheetEmbed") {
      const sheetId = String(node.attrs.sheetId ?? "").trim() || "sheet";
      items.push({
        id: `rgd-sheet-${pos}-${sheetId}`,
        kind: "rgdSheet",
        level: 2,
        text: `RGD · ${sheetId}`,
        pos,
      });
      return;
    }
    if (node.type.name === "rgdBlock") {
      const rgdType = (node.attrs.rgdType as RgdBlockType) ?? "pillars";
      const meta = RGD_TYPE_META[rgdType];
      const title = String(node.attrs.title ?? "").trim();
      let detail = "";
      try {
        const payload = parsePayload(rgdType, node.attrs.payload);
        if (rgdType === "gameplay") {
          const g = (payload as { gameplay?: string }).gameplay?.trim();
          if (g) detail = g;
        } else if (rgdType === "mechanic") {
          const n = (payload as { name?: string }).name?.trim();
          if (n) detail = n;
        } else if (rgdType === "pattern") {
          const n = (payload as { name?: string }).name?.trim();
          if (n) detail = n;
        }
      } catch {
        /* ignore */
      }
      const text =
        detail || title || `RGD ${meta.step}: ${meta.shortLabel}`;
      items.push({
        id: `rgd-${pos}-${rgdType}`,
        kind: "rgd",
        level: 2,
        text: `RGD ${meta.step} · ${text}`,
        pos,
        rgdType,
      });
    }
  });
  return items;
}

/** Headings only — targets for in-document section links. */
export function collectHeadings(editor: Editor): OutlineItem[] {
  return collectOutline(editor).filter((i) => i.kind === "heading");
}

export function findHeading(
  editor: Editor,
  title: string,
  slug = "",
): OutlineItem | null {
  const headings = collectHeadings(editor);
  const titleNeedle = title.trim().toLowerCase();
  const slugNeedle = (slug || slugifyHeading(title)).toLowerCase();

  if (titleNeedle) {
    const byTitle = headings.find(
      (h) => h.text.trim().toLowerCase() === titleNeedle,
    );
    if (byTitle) return byTitle;
  }
  if (slugNeedle) {
    const bySlug = headings.find(
      (h) => slugifyHeading(h.text) === slugNeedle,
    );
    if (bySlug) return bySlug;
  }
  // Soft match: heading contains the needle (for short titles)
  if (titleNeedle.length >= 2) {
    const soft = headings.find((h) =>
      h.text.trim().toLowerCase().includes(titleNeedle),
    );
    if (soft) return soft;
  }
  return null;
}

export function jumpToOutlineItem(
  editor: Editor,
  pos: number,
  kind?: OutlineItem["kind"],
): void {
  editor.chain().focus().setTextSelection(pos + 1).run();
  if (kind === "rgd") {
    window.dispatchEvent(
      new CustomEvent(RGD_EXPAND_EVENT, { detail: { pos } }),
    );
  }
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const coords = editor.view.coordsAtPos(pos + 1);
  const scroller = editor.view.dom.closest(".editor-canvas");
  if (scroller instanceof HTMLElement) {
    const top =
      coords.top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      24;
    scroller.scrollTo({ top, behavior: "smooth" });
  }
}
