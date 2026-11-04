import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  collectOutline,
  jumpToOutlineItem,
  type OutlineItem,
} from "./documentOutline";

type MapFilter = "all" | "rgd";

type DocumentMapProps = {
  editor: Editor | null;
};

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
    jumpToOutlineItem(editor, pos, kind);
  };

  const visible =
    filter === "rgd"
      ? items.filter((i) => i.kind === "rgd" || i.kind === "rgdSheet")
      : items;
  const rgdCount = items.filter(
    (i) => i.kind === "rgd" || i.kind === "rgdSheet",
  ).length;

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
            title="Show Rational Game Design references only"
          >
            RGD{rgdCount ? ` (${rgdCount})` : ""}
          </button>
        </div>
      </header>
      {visible.length === 0 ? (
        <p className="muted tiny doc-side-empty">
          {filter === "rgd"
            ? "No RGD cards yet. Use Insert RGD… in the toolbar."
            : "Add H1–H3 headings or RGD cards to build an outline."}
        </p>
      ) : (
        <ul className="doc-map-list">
          {visible.map((h) => (
            <li
              key={h.id}
              className={`doc-map-item level-${h.level}${
                h.kind === "rgd" || h.kind === "rgdSheet" ? " is-rgd" : ""
              }`}
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
