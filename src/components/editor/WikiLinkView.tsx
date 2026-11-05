import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { resolveWikiSlug } from "../../api";

type ExtraProps = {
  projectId: string;
  onOpenDoc?: (docId: string) => void;
};

/**
 * Cross-document wiki link. Resolves title/slug/docId against project docs;
 * click opens/switches the active document.
 */
export function WikiLinkView(props: NodeViewProps) {
  const title = String(props.node.attrs.title ?? "");
  const slug = String(props.node.attrs.slug ?? "");
  const docIdAttr = String(props.node.attrs.docId ?? "");
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [resolvedId, setResolvedId] = useState(docIdAttr);
  const [resolvedTitle, setResolvedTitle] = useState(title);
  const [missing, setMissing] = useState(false);
  const updateAttributes = props.updateAttributes;

  useEffect(() => {
    let cancelled = false;
    const needle = docIdAttr || slug || title;
    if (!needle || !projectId) {
      setMissing(true);
      return;
    }
    void resolveWikiSlug(projectId, needle).then((hit) => {
      if (cancelled) return;
      if (hit) {
        setResolvedId(hit.id);
        setResolvedTitle(hit.title);
        setMissing(false);
        if (hit.id !== docIdAttr || hit.slug !== slug || hit.title !== title) {
          updateAttributes({
            docId: hit.id,
            slug: hit.slug,
            title: hit.title,
          });
        }
      } else {
        setMissing(true);
        setResolvedId("");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, docIdAttr, slug, title, updateAttributes]);

  const open = () => {
    if (resolvedId && extra.onOpenDoc) {
      extra.onOpenDoc(resolvedId);
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      className={missing ? "wiki-link missing" : "wiki-link"}
      contentEditable={false}
      title={
        missing
          ? `No document “${title || slug}” — create one with this title`
          : `Open “${resolvedTitle}”`
      }
    >
      <button type="button" className="wiki-link-btn" onClick={open}>
        {resolvedTitle || title || slug || "wiki"}
      </button>
    </NodeViewWrapper>
  );
}
