import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import type { WhiteboardDocument, WhiteboardLayer } from "../../types";
import type { PushHistoryOptions } from "../../hooks/useHistoryStack";
import { ToolbarIconButton } from "../editor/ToolbarIconButton";
import {
  addWhiteboardLayer,
  MAX_LAYERS,
  removeWhiteboardLayer,
  reorderWhiteboardLayer,
  updateWhiteboardLayer,
} from "./whiteboardModel";

type WhiteboardLayersPanelProps = {
  doc: WhiteboardDocument;
  onCommit: (
    next: WhiteboardDocument,
    historyOpts?: PushHistoryOptions,
  ) => void;
};

/** Dark-theme layers stack: active target, show/hide, lock, opacity, reorder. */
export function WhiteboardLayersPanel({
  doc,
  onCommit,
}: WhiteboardLayersPanelProps) {
  const layersTopFirst = [...doc.layers].reverse();

  const patchLayer = (
    layerId: string,
    patch: Partial<Pick<WhiteboardLayer, "name" | "visible" | "locked" | "opacity">>,
    historyOpts?: PushHistoryOptions,
  ) => {
    onCommit(updateWhiteboardLayer(doc, layerId, patch), historyOpts);
  };

  return (
    <section className="whiteboard-layers-panel" aria-label="Layers">
      <header className="whiteboard-layers-header">
        <span className="whiteboard-layers-title">
          <Layers className="toolbar-icon" aria-hidden strokeWidth={2} />
          Layers
        </span>
        <div className="whiteboard-layers-actions">
          <ToolbarIconButton
            label="Add layer"
            icon={Plus}
            className="whiteboard-layer-icon-btn"
            disabled={doc.layers.length >= MAX_LAYERS}
            onClick={() => onCommit(addWhiteboardLayer(doc))}
          />
        </div>
      </header>
      <ul className="whiteboard-layers-list">
        {layersTopFirst.map((layer) => {
          const index = doc.layers.findIndex((l) => l.id === layer.id);
          const isActive = layer.id === doc.activeLayerId;
          const canUp = index < doc.layers.length - 1;
          const canDown = index > 0;
          return (
            <li
              key={layer.id}
              className={
                isActive
                  ? "whiteboard-layer-row is-active"
                  : "whiteboard-layer-row"
              }
            >
              <button
                type="button"
                className="whiteboard-layer-select"
                title={
                  isActive
                    ? `${layer.name} (active)`
                    : `Set ${layer.name} as active layer`
                }
                aria-pressed={isActive}
                onClick={() => {
                  if (layer.id === doc.activeLayerId) return;
                  onCommit({ ...doc, activeLayerId: layer.id });
                }}
              >
                <span className="whiteboard-layer-active-dot" aria-hidden />
              </button>
              <input
                className="whiteboard-layer-name"
                value={layer.name}
                aria-label={`Rename ${layer.name}`}
                title="Layer name"
                onChange={(e) =>
                  patchLayer(layer.id, { name: e.target.value }, { coalesce: true })
                }
                onFocus={() => {
                  if (layer.id !== doc.activeLayerId) {
                    onCommit({ ...doc, activeLayerId: layer.id });
                  }
                }}
              />
              <ToolbarIconButton
                label={layer.visible ? "Hide layer" : "Show layer"}
                icon={layer.visible ? Eye : EyeOff}
                className="whiteboard-layer-icon-btn"
                pressed={!layer.visible}
                onClick={() =>
                  patchLayer(layer.id, { visible: !layer.visible })
                }
              />
              <ToolbarIconButton
                label={layer.locked ? "Unlock layer" : "Lock layer"}
                icon={layer.locked ? Lock : Unlock}
                className="whiteboard-layer-icon-btn"
                pressed={layer.locked}
                onClick={() =>
                  patchLayer(layer.id, { locked: !layer.locked })
                }
              />
              <label
                className="whiteboard-layer-opacity"
                title={`Opacity ${Math.round(layer.opacity * 100)}%`}
              >
                <span className="visually-hidden">Layer opacity</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(layer.opacity * 100)}
                  aria-label={`${layer.name} opacity`}
                  onChange={(e) =>
                    patchLayer(
                      layer.id,
                      { opacity: Number(e.target.value) / 100 },
                      { coalesce: true },
                    )
                  }
                />
              </label>
              <ToolbarIconButton
                label="Move layer up"
                icon={ChevronUp}
                className="whiteboard-layer-icon-btn"
                disabled={!canUp}
                onClick={() =>
                  onCommit(reorderWhiteboardLayer(doc, layer.id, "up"))
                }
              />
              <ToolbarIconButton
                label="Move layer down"
                icon={ChevronDown}
                className="whiteboard-layer-icon-btn"
                disabled={!canDown}
                onClick={() =>
                  onCommit(reorderWhiteboardLayer(doc, layer.id, "down"))
                }
              />
              <ToolbarIconButton
                label="Delete layer"
                icon={Trash2}
                className="whiteboard-layer-icon-btn"
                disabled={doc.layers.length <= 1}
                onClick={() =>
                  onCommit(removeWhiteboardLayer(doc, layer.id))
                }
              />
            </li>
          );
        })}
      </ul>
      <p className="muted tiny whiteboard-layers-hint">
        New ink goes on the active layer. Hidden layers skip embeds/PDF; locked
        layers block select, erase, and draw.
      </p>
    </section>
  );
}
