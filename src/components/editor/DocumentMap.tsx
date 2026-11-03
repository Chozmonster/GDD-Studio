import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

export type OutlineHeading = {
  id: string;
  level: number;
  text: string;
  pos: number;
};

type DocumentMapProps = {
  editor: Editor | null;
};

function collectHeadings(editor: Editor): OutlineHeading[] {
  const items: OutlineHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = Number(node.attrs.level ?? 1);
    const text = node.textContent.trim() || `Heading ${level}`;
    items.push({
      id: `h-${pos}-${level}`,
      level,
      text,
      pos,
    });
  });
  return items;
}

export function DocumentMap({ editor }: DocumentMapProps) {
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);

  useEffect(() => {
    if (!editor) {
      setHeadings([]);
      return;
    }
    const refresh = () => setHeadings(collectHeadings(editor));
    refresh();
    editor.on("update", refresh);
    editor.on("selectionUpdate", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", refresh);
    };
  }, [editor]);

  const jumpTo = (pos: number) => {
    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
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

  return (
    <aside className="doc-side-panel doc-map" aria-label="Document map">
      <header className="doc-side-header">
        <h3>Document map</h3>
      </header>
      {headings.length === 0 ? (
        <p className="muted tiny doc-side-empty">
          Add H1–H3 headings to build an outline.
        </p>
      ) : (
        <ul className="doc-map-list">
          {headings.map((h) => (
            <li key={h.id} className={`doc-map-item level-${h.level}`}>
              <button type="button" onClick={() => jumpTo(h.pos)} title={h.text}>
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
