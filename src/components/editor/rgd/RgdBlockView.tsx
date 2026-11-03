import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parsePayload,
  RGD_EXPAND_EVENT,
  serializePayload,
} from "./rgdContent";
import { RgdStepFields } from "./RgdStepFields";
import type { RgdBlockType } from "./rgdTypes";
import { RGD_TYPE_META } from "./rgdTypes";

type ExtraProps = {
  projectId: string;
  onOpenFlowchart?: (flowchartId: string) => void;
};

/**
 * Legacy TipTap node view — kept so unmigrated docs still render until
 * migrate-on-open replaces rgdBlock nodes with rgdSheetEmbed cards.
 */
export function RgdBlockView(props: NodeViewProps) {
  const rgdType = (props.node.attrs.rgdType as RgdBlockType) ?? "pillars";
  const meta = RGD_TYPE_META[rgdType];
  const extra = props.extension.options as ExtraProps;
  const title = String(props.node.attrs.title ?? meta.label);
  const [expanded, setExpanded] = useState(false);

  const payload = useMemo(
    () => parsePayload(rgdType, props.node.attrs.payload),
    [rgdType, props.node.attrs.payload],
  );

  const setTitle = (next: string) => {
    props.updateAttributes({ title: next });
  };

  const patchPayload = useCallback(
    (next: object) => {
      props.updateAttributes({ payload: serializePayload(next) });
    },
    [props],
  );

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  useEffect(() => {
    const onExpandRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ pos?: number }>).detail;
      if (!detail || typeof detail.pos !== "number") return;
      let pos: number | undefined;
      try {
        const raw = props.getPos();
        pos = typeof raw === "number" ? raw : undefined;
      } catch {
        return;
      }
      if (pos === detail.pos) setExpanded(true);
    };
    window.addEventListener(RGD_EXPAND_EVENT, onExpandRequest);
    return () => window.removeEventListener(RGD_EXPAND_EVENT, onExpandRequest);
  }, [props.getPos]);

  return (
    <NodeViewWrapper
      className={`rgd-block rgd-${rgdType}${expanded ? " is-expanded" : " is-collapsed"}`}
      data-rgd-type={rgdType}
      data-drag-handle
    >
      <header
        className="rgd-block-chrome"
        onClick={(e) => {
          if (
            expanded &&
            (e.target as HTMLElement).closest(".rgd-title-input")
          ) {
            return;
          }
          toggleExpanded();
        }}
      >
        <button
          type="button"
          className="rgd-collapse-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse RGD block" : "Expand RGD block"}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
        >
          <span className="rgd-chevron" aria-hidden="true" />
        </button>
        <span className="rgd-step-badge" title={meta.description}>
          RGD {meta.step} · {meta.shortLabel}
        </span>
        {expanded ? (
          <input
            className="rgd-title-input"
            value={title}
            aria-label={`${meta.label} title`}
            onChange={(e) => setTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="rgd-title-collapsed">{title || meta.label}</span>
        )}
      </header>

      {expanded && (
        <div className="rgd-block-body">
          <p className="rgd-hint muted tiny" style={{ padding: "0.45rem 0.65rem 0" }}>
            Legacy in-document block — open this project’s RGD tab after migration for the sheet workspace.
          </p>
          <RgdStepFields
            rgdType={rgdType}
            payload={payload}
            onChange={patchPayload}
            projectId={extra.projectId}
            onOpenFlowchart={extra.onOpenFlowchart}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}
