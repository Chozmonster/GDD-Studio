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

/** Nested outline node for Document map rendering (H1 → H2 → H3). */
export type OutlineTreeNode = OutlineItem & {
  children: OutlineTreeNode[];
};

/**
 * Nest flat outline items by level: each item attaches under the nearest
 * preceding item with a strictly smaller level (H2 under H1, H3 under H2
 * or H1). Same-level siblings stay sequential under their shared parent.
 */
export function buildOutlineTree(items: OutlineItem[]): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = [];
  const stack: OutlineTreeNode[] = [];

  for (const item of items) {
    const node: OutlineTreeNode = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }

  return roots;
}

/** Heading + RGD outline for the Document map sidebar. */
export function collectOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level ?? 1);
      // Editor only exposes H1–H3; skip deeper levels if present in legacy docs.
      if (level < 1 || level > 3) return;
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
