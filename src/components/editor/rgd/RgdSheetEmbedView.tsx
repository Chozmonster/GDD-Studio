import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { loadRgdSheet, rgdSheetExists } from "../../../api";
import { onRgdSheetDeleted, onRgdSheetSaved } from "../../../lib/rgdEvents";
import type { RgdSheetDocument } from "../../../types";
import {
  filledStepCount,
  normalizeRgdSheet,
  summarizeRgdSheet,
} from "./rgdSheetModel";
import { RGD_INSERT_ORDER, RGD_TYPE_META } from "./rgdTypes";

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

  const filled = doc ? filledStepCount(doc) : 0;
  const summary = doc ? summarizeRgdSheet(doc) : "";

  return (
    <NodeViewWrapper
      className={missing ? "rgd-sheet-card broken" : "rgd-sheet-card"}
      data-drag-handle
    >
      <div className="rgd-sheet-card-chrome">
        <span className="rgd-step-badge">RGD</span>
        <div className="rgd-sheet-card-text">
          <span className="rgd-sheet-card-title">
            {missing
              ? `Missing sheet “${sheetId || "?"}”`
              : (doc?.name ?? sheetId)}
          </span>
          {!missing && !loading && (
            <span className="muted tiny rgd-sheet-card-summary">
              {summary} · {filled}/{RGD_INSERT_ORDER.length} steps
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
        <ul className="rgd-sheet-card-steps" aria-label="RGD step overview">
          {RGD_INSERT_ORDER.map((type) => {
            const meta = RGD_TYPE_META[type];
            return (
              <li key={type} title={meta.label}>
                {meta.step}
              </li>
            );
          })}
        </ul>
      )}
    </NodeViewWrapper>
  );
}
