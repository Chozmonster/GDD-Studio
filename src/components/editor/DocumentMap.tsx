import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { parsePayload, RGD_EXPAND_EVENT } from "./rgd/rgdContent";
import type { RgdBlockType } from "./rgd/rgdTypes";
import { RGD_TYPE_META } from "./rgd/rgdTypes";

export type OutlineItem = {
  id: string;
  kind: "heading" | "rgd";
  level: number;
  text: string;
  pos: number;
  rgdType?: RgdBlockType;
};

type MapFilter = "all" | "rgd";

type DocumentMapProps = {
  editor: Editor | null;
};

function collectOutline(editor: Editor): OutlineItem[] {
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

export function DocumentMap({ editor }: DocumentMapProps) {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [filter, setFilter] = useState<MapFilter>("all");

  useEffect(() => {
    if (!editor) {
      setItems([]);
      return;
    }
    const refresh = () => setItems(collectOutline(editor));
    refresh();
    editor.on("update", refresh);
    editor.on("selectionUpdate", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", refresh);
    };
  }, [editor]);

  const jumpTo = (pos: number, kind?: OutlineItem["kind"]) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    if (kind === "rgd") {
      window.dispatchEvent(
        new CustomEvent(RGD_EXPAND_EVENT, { detail: { pos } }),
      );
    }
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      const coords = editor.view.coordsAtPos(pos + 1);
      const scroller = editor.view.dom.closest(".editor-canvas");
      if (scroller instanceof HTMLElement) {
        const top =
          coords.top - scroller.getBoundingClientRect().top + scroller.scrollTop - 24;
        scroller.scrollTo({ top, behavior: "smooth" });
      }
    }
  };

  const visible =
    filter === "rgd" ? items.filter((i) => i.kind === "rgd") : items;
  const rgdCount = items.filter((i) => i.kind === "rgd").length;

  return (
    <aside className="doc-side-panel doc-map" aria-label="Document map">
      <header className="doc-side-header">
        <h3>Document map</h3>
        <div className="doc-map-filters" role="group" aria-label="Outline filter">
          <button
            type="button"
            className="tiny-btn"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className="tiny-btn"
            aria-pressed={filter === "rgd"}
            onClick={() => setFilter("rgd")}
            title="Show Rational Game Design blocks only"
          >
            RGD{rgdCount ? ` (${rgdCount})` : ""}
          </button>
        </div>
      </header>
      {visible.length === 0 ? (
        <p className="muted tiny doc-side-empty">
          {filter === "rgd"
            ? "No RGD blocks yet. Use Insert RGD… in the toolbar."
            : "Add H1–H3 headings or RGD blocks to build an outline."}
        </p>
      ) : (
        <ul className="doc-map-list">
          {visible.map((h) => (
            <li
              key={h.id}
              className={`doc-map-item level-${h.level}${h.kind === "rgd" ? " is-rgd" : ""}`}
            >
              <button
                type="button"
                onClick={() => jumpTo(h.pos, h.kind)}
                title={h.text}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
