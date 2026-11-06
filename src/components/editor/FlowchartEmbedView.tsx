/**
 * Live flowchart embed — listens for flowchart save/delete events so Document
 * previews stay in sync with the Flowcharts tab without a page reload.
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  flowchartExists,
  loadFlowchart,
} from "../../api";
import {
  onFlowchartDeleted,
  onFlowchartSaved,
} from "../../lib/flowchartEvents";
import type { FlowchartDocument } from "../../types";
import { FlowchartPreview } from "../flowchart/FlowchartPreview";

type ExtraProps = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
};

export function FlowchartEmbedView(props: NodeViewProps) {
  const flowchartId = String(props.node.attrs.flowchartId ?? "main");
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [doc, setDoc] = useState<FlowchartDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const exists = await flowchartExists(projectId, flowchartId);
        if (!exists) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const loaded = await loadFlowchart(projectId, flowchartId);
        if (!cancelled) {
          setMissing(false);
          setDoc(loaded);
        }
      } catch {
        if (!cancelled) {
          setMissing(true);
          setDoc(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, flowchartId]);

  useEffect(() => {
    const offSaved = onFlowchartSaved((detail) => {
      if (detail.projectId !== projectId || detail.flowchartId !== flowchartId) {
        return;
      }
      setMissing(false);
      setDoc(detail.document);
      setLoading(false);
    });
    const offDeleted = onFlowchartDeleted((detail) => {
      if (detail.projectId !== projectId || detail.flowchartId !== flowchartId) {
        return;
      }
      setMissing(true);
      setDoc(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, flowchartId]);

  return (
    <NodeViewWrapper
      className={missing ? "flowchart-embed broken" : "flowchart-embed"}
      data-drag-handle
    >
      <div className="flowchart-embed-chrome">
        <span className="flowchart-embed-title">
          {missing
            ? `Missing flowchart “${flowchartId}”`
            : `Flowchart: ${doc?.name ?? flowchartId}`}
        </span>
        <button
          type="button"
          className="ghost"
          disabled={missing}
          onClick={() => extra.onOpenFlowchart?.(flowchartId)}
        >
          Open editor
        </button>
      </div>
      {loading && <p className="muted tiny embed-status">Loading preview…</p>}
      {missing && (
        <p className="error embed-status">
          Broken embed — this flowchart was deleted or never saved. Insert another
          from the toolbar.
        </p>
      )}
      {!missing && doc && (
        <>
          <FlowchartPreview document={doc} className="flowchart-preview embed" />
          {doc.description?.trim() ? (
            <p className="flowchart-embed-description">{doc.description}</p>
          ) : null}
        </>
      )}
    </NodeViewWrapper>
  );
}
