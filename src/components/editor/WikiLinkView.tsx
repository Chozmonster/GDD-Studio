import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { findHeading, jumpToOutlineItem } from "./documentOutline";

/**
 * In-document section link (TipTap node still named wikiLink for stored JSON).
 * Resolves against current-doc headings; click smooth-scrolls like Document Map.
 */
export function WikiLinkView(props: NodeViewProps) {
  const title = String(props.node.attrs.title ?? "");
  const slug = String(props.node.attrs.slug ?? "");
  const editor = props.editor;
  const [missing, setMissing] = useState(false);
  const [label, setLabel] = useState(title || slug || "section");

  useEffect(() => {
    if (!editor) {
      setMissing(true);
      return;
    }
    const refresh = () => {
      const hit = findHeading(editor, title, slug);
      if (hit) {
        setMissing(false);
        setLabel(title.trim() || hit.text);
      } else {
        setMissing(true);
        setLabel(title || slug || "section");
      }
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [editor, title, slug]);

  const open = () => {
    if (!editor) return;
    const hit = findHeading(editor, title, slug);
    if (!hit) return;
    jumpToOutlineItem(editor, hit.pos, hit.kind);
  };

  return (
    <NodeViewWrapper
      as="span"
      className={missing ? "wiki-link missing" : "wiki-link"}
      contentEditable={false}
      title={
        missing
          ? `No heading “${title || slug}” in this document`
          : `Jump to “${label}”`
      }
    >
      <button type="button" className="wiki-link-btn" onClick={open}>
        {label}
      </button>
    </NodeViewWrapper>
  );
}
