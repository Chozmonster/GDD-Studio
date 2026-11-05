import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { loadRgdSheet, rgdSheetExists } from "../../../api";
import { onRgdSheetDeleted, onRgdSheetSaved } from "../../../lib/rgdEvents";
import type { RgdSheetDocument } from "../../../types";
import { RgdLiveTable } from "./RgdLiveTable";
import { normalizeRgdSheet } from "./rgdSheetModel";
import { parseMechanics } from "./rgdTableModel";

type ExtraProps = {
  projectId: string;
  onOpenRgdSheet?: (sheetId: string) => void;
};

export function RgdSheetEmbedView(props: NodeViewProps) {
  const sheetId = String(props.node.attrs.sheetId ?? "");
  const extra = props.extension.options as ExtraProps;
  const projectId = extra.projectId;
  const [doc, setDoc] = useState<RgdSheetDocument | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (!sheetId) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const exists = await rgdSheetExists(projectId, sheetId);
        if (!exists) {
          if (!cancelled) {
            setMissing(true);
            setDoc(null);
          }
          return;
        }
        const loaded = normalizeRgdSheet(
          await loadRgdSheet(projectId, sheetId),
        );
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
  }, [projectId, sheetId]);

  useEffect(() => {
    const offSaved = onRgdSheetSaved((detail) => {
      if (detail.projectId !== projectId || detail.sheetId !== sheetId) return;
      setMissing(false);
      setDoc(normalizeRgdSheet(detail.document));
      setLoading(false);
    });
    const offDeleted = onRgdSheetDeleted((detail) => {
      if (detail.projectId !== projectId || detail.sheetId !== sheetId) return;
      setMissing(true);
      setDoc(null);
    });
    return () => {
      offSaved();
      offDeleted();
    };
  }, [projectId, sheetId]);

  return (
    <NodeViewWrapper
      className={
        missing ? "rgd-sheet-card rgd-table-embed broken" : "rgd-sheet-card rgd-table-embed"
      }
      data-drag-handle
      data-sheet-id={sheetId}
    >
      <div className="rgd-sheet-card-chrome">
        <span className="rgd-step-badge">RGD</span>
        <div className="rgd-sheet-card-text">
          <span className="rgd-sheet-card-title">
            {missing
              ? `Missing sheet “${sheetId || "?"}”`
              : (doc?.name ?? sheetId)}
          </span>
          {!missing && !loading && doc && (
            <span className="muted tiny rgd-sheet-card-summary">
              Live mechanic table
            </span>
          )}
        </div>
        <button
          type="button"
          className="ghost tiny-btn"
          disabled={missing || !sheetId}
          onClick={() => sheetId && extra.onOpenRgdSheet?.(sheetId)}
        >
          Open in RGD
        </button>
      </div>
      {loading && <p className="muted tiny embed-status">Loading…</p>}
      {missing && (
        <p className="error embed-status">
          Broken embed — this RGD sheet was deleted or never saved. Insert
          another from the toolbar.
        </p>
      )}
      {!missing && doc && !loading && (
        <RgdLiveTable
          title={doc.name}
          mechanics={parseMechanics(doc.mechanics)}
          className="rgd-embed-table"
        />
      )}
    </NodeViewWrapper>
  );
}
