import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  buildOutlineTree,
  collectOutline,
  jumpToOutlineItem,
  type OutlineItem,
  type OutlineTreeNode,
} from "./documentOutline";

type MapFilter = "all" | "rgd";

type DocumentMapProps = {
  editor: Editor | null;
};

function MapTree({
  nodes,
  onJump,
}: {
  nodes: OutlineTreeNode[];
  onJump: (pos: number, kind?: OutlineItem["kind"]) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className="doc-map-list">
      {nodes.map((node) => (
        <li
          key={node.id}
          className={`doc-map-item level-${node.level}${
            node.kind === "rgd" || node.kind === "rgdSheet" ? " is-rgd" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onJump(node.pos, node.kind)}
            title={node.text}
          >
            {node.text}
          </button>
          {node.children.length > 0 ? (
            <MapTree nodes={node.children} onJump={onJump} />
          ) : null}
        </li>
      ))}
    </ul>
  );
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
    jumpToOutlineItem(editor, pos, kind);
  };

  const visible =
    filter === "rgd"
      ? items.filter((i) => i.kind === "rgd" || i.kind === "rgdSheet")
      : items;
  const tree = buildOutlineTree(visible);
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
      {tree.length === 0 ? (
        <p className="muted tiny doc-side-empty">
          {filter === "rgd"
            ? "No RGD tables yet. Use Insert RGD… in the toolbar."
            : "Add H1–H3 headings or RGD tables to build an outline."}
        </p>
      ) : (
        <MapTree nodes={tree} onJump={jumpTo} />
      )}
    </aside>
  );
}
