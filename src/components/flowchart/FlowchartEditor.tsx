import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  SelectionMode,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { loadFlowchart, saveFlowchart } from "../../api";
import type { FlowchartDocument, ProjectRecord } from "../../types";
import { FlowNode } from "./FlowNode";
import { SplitPane } from "../SplitPane";
import { FlowchartSidebar } from "./FlowchartSidebar";
import { SnapGuides } from "./SnapGuides";
import { StubCurveEdge, StubStepEdge } from "./StubbedEdge";
import {
  GRID_SIZE,
  nodeBox,
  snapDragPosition,
  snapSize,
  type SnapGuide,
} from "./nodeSnap";
import {
  COLOR_PALETTE,
  NODE_KIND_OPTIONS,
  SHAPE_OPTIONS,
  defaultSizeFor,
  edgeTypeForPath,
  kindDefaults,
  markerForArrow,
  migrateEdge,
  migrateNode,
  serializeEdge,
  serializeNode,
  type FlowEdge,
  type FlowEdgePath,
  type FlowNode as FlowNodeT,
  type FlowNodeKind,
  type FlowNodeShape,
} from "./flowModel";
import {
  cloneClipboardPayload,
  extractClipboardSelection,
  type FlowClipboardPayload,
} from "./flowClipboard";
import {
  alignNodePositions,
  distributeNodePositions,
  type AlignMode,
  type DistributeAxis,
} from "./flowAlign";
import {
  isFlowAnchorId,
  oppositeAnchor,
  quickAddPosition,
} from "./flowQuickAdd";
import {
  emitFlowchartSaved,
  onFlowchartSaved,
} from "../../lib/flowchartEvents";
import { useHistoryStack } from "../../hooks/useHistoryStack";
import {
  isEditableKeyboardTarget,
  undoRedoFromKeyboard,
} from "../../lib/undoKeyboard";
import { UndoRedoButtons } from "../editor/UndoRedoButtons";

type FlowClipboard = {
  mode: "copy" | "cut";
  payload: FlowClipboardPayload;
};

type ContextMenuState =
  | { x: number; y: number; target: "node"; nodeId: string }
  | { x: number; y: number; target: "edge"; edgeId: string }
  | { x: number; y: number; target: "pane" };

type FlowchartEditorProps = {
  project: ProjectRecord;
  /** When false, this tab is hidden — skip window keyboard undo handling. */
  active?: boolean;
  /** When set (e.g. from a document embed Open), select that flowchart. */
  focusFlowchartId?: string | null;
};

type FlowSnapshot = {
  name: string;
  description: string;
  nodes: FlowNodeT[];
  edges: FlowEdge[];
};

function cloneFlowNodes(nodes: FlowNodeT[]): FlowNodeT[] {
  return nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    style: n.style ? { ...n.style } : n.style,
    measured: n.measured ? { ...n.measured } : n.measured,
    data: {
      label: n.data.label,
      kind: n.data.kind,
      shape: n.data.shape,
      fill: n.data.fill,
    },
    selected: false,
    dragging: false,
  }));
}

function cloneFlowEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map((e) => ({
    ...e,
    data: e.data
      ? {
          path: e.data.path,
          startArrow: e.data.startArrow,
          endArrow: e.data.endArrow,
        }
      : e.data,
    selected: false,
  }));
}

const nodeTypes = { flow: FlowNode, labeled: FlowNode };
const edgeTypes = { stubCurve: StubCurveEdge, stubStep: StubStepEdge };

function toDoc(
  id: string,
  name: string,
  description: string,
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
): FlowchartDocument {
  return {
    format: "gdd-studio-flowchart",
    version: 2,
    id,
    name,
    description,
    nodes: nodes.map(serializeNode),
    edges: edges.map(serializeEdge),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  };
}

function withNodeHandlers(
  node: ReturnType<typeof migrateNode>,
  setNodes: Dispatch<SetStateAction<FlowNodeT[]>>,
  queueSaveRef: MutableRefObject<(nodes: Node[], edges: Edge[]) => void>,
  edgesRef: MutableRefObject<FlowEdge[]>,
  recordHistoryRef: MutableRefObject<(() => void) | null>,
  quickAddRef: MutableRefObject<
    ((nodeId: string, handleId: string) => void) | null
  >,
): FlowNodeT {
  return {
    ...node,
    data: {
      ...node.data,
      onChangeLabel: (nodeId: string, label: string) => {
        recordHistoryRef.current?.();
        setNodes((prev) => {
          const next = prev.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
          );
          queueSaveRef.current(next, edgesRef.current);
          return next;
        });
      },
      onQuickAdd: (nodeId: string, handleId: string) => {
        quickAddRef.current?.(nodeId, handleId);
      },
    },
  };
}

/** Attach inline label handler (and keep startEditToken) on an edge. */
function withEdgeHandlers(
  edge: FlowEdge,
  onChangeLabelRef: MutableRefObject<
    ((edgeId: string, label: string) => void) | null
  >,
): FlowEdge {
  return {
    ...edge,
    data: {
      path: edge.data?.path ?? "step",
      startArrow: edge.data?.startArrow ?? false,
      endArrow: edge.data?.endArrow !== false,
      startEditToken: edge.data?.startEditToken,
      onChangeLabel: (edgeId: string, label: string) => {
        onChangeLabelRef.current?.(edgeId, label);
      },
    },
  };
}

export function FlowchartEditor({
  project,
  active = true,
  focusFlowchartId,
}: FlowchartEditorProps) {
  const [flowchartId, setFlowchartId] = useState("main");
  const [name, setName] = useState("Main");
  const [nodes, setNodes] = useNodesState<FlowNodeT>([]);
  const [edges, setEdges] = useEdgesState<FlowEdge>([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  /** Defaults for new connectors when none are selected (toolbar ↔ onConnect). */
  const [defaultEdgePath, setDefaultEdgePath] = useState<FlowEdgePath>("step");
  const [defaultStartArrow, setDefaultStartArrow] = useState(false);
  const [defaultEndArrow, setDefaultEndArrow] = useState(true);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const rfRef = useRef<ReactFlowInstance<FlowNodeT, FlowEdge> | null>(null);
  const saveTimer = useRef<number | null>(null);
  const idCounter = useRef(1);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const nameRef = useRef(name);
  /** Kept out of React state — sidebar Description edits sync via events. */
  const descriptionRef = useRef("");
  const defaultEdgePathRef = useRef(defaultEdgePath);
  const defaultStartArrowRef = useRef(defaultStartArrow);
  const defaultEndArrowRef = useRef(defaultEndArrow);
  const recordHistoryRef = useRef<(() => void) | null>(null);
  const quickAddRef = useRef<((nodeId: string, handleId: string) => void) | null>(
    null,
  );
  const edgeLabelChangeRef = useRef<
    ((edgeId: string, label: string) => void) | null
  >(null);
  const clipboardRef = useRef<FlowClipboard | null>(null);
  const dragHistoryCaptured = useRef(false);
  const resizeHistoryCaptured = useRef(false);
  const applyingHistory = useRef(false);
  const {
    push: pushHistory,
    undo: undoHistory,
    redo: redoHistory,
    clear: clearHistory,
    canUndo,
    canRedo,
  } = useHistoryStack<FlowSnapshot>();
  nodesRef.current = nodes;
  edgesRef.current = edges;
  nameRef.current = name;
  defaultEdgePathRef.current = defaultEdgePath;
  defaultStartArrowRef.current = defaultStartArrow;
  defaultEndArrowRef.current = defaultEndArrow;

  const takeSnapshot = useCallback((): FlowSnapshot => {
    return {
      name: nameRef.current,
      description: descriptionRef.current,
      nodes: cloneFlowNodes(nodesRef.current),
      edges: cloneFlowEdges(edgesRef.current),
    };
  }, []);

  const recordHistory = useCallback(
    (opts?: { coalesce?: boolean; coalesceMs?: number }) => {
      if (applyingHistory.current) return;
      pushHistory(takeSnapshot(), opts);
    },
    [pushHistory, takeSnapshot],
  );

  recordHistoryRef.current = () => recordHistory();

  const persist = useCallback(
    async (nextNodes: Node[], nextEdges: Edge[], vp: Viewport) => {
      const doc = toDoc(
        flowchartId,
        nameRef.current,
        descriptionRef.current,
        nextNodes,
        nextEdges,
        vp,
      );
      try {
        await saveFlowchart(project.id, flowchartId, doc);
        emitFlowchartSaved(project.id, flowchartId, doc);
        setDirty(false);
        setStatus(`Saved ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [project.id, flowchartId],
  );

  const queueSave = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      setDirty(true);
      // Optimistic live update so Document embeds refresh before disk save.
      const snapshot = toDoc(
        flowchartId,
        nameRef.current,
        descriptionRef.current,
        nextNodes,
        nextEdges,
        viewportRef.current,
      );
      emitFlowchartSaved(project.id, flowchartId, snapshot);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(nextNodes, nextEdges, viewportRef.current);
      }, 450);
    },
    [persist, project.id, flowchartId],
  );

  const queueSaveRef = useRef(queueSave);
  queueSaveRef.current = queueSave;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setStatus("Loading…");
    void (async () => {
      try {
        const doc = await loadFlowchart(project.id, flowchartId);
        if (cancelled) return;
        setName(doc.name || flowchartId);
        descriptionRef.current = doc.description ?? "";
        viewportRef.current = doc.viewport ?? { x: 0, y: 0, zoom: 1 };
        const loaded = (doc.nodes ?? []).map((n) =>
          withNodeHandlers(
            migrateNode(n),
            setNodes,
            queueSaveRef,
            edgesRef,
            recordHistoryRef,
            quickAddRef,
          ),
        );
        idCounter.current =
          loaded.reduce((max, n) => {
            const m = /^n-(\d+)$/.exec(n.id);
            return m ? Math.max(max, Number(m[1])) : max;
          }, 0) + 1;
        setNodes(loaded);
        setEdges(
          (doc.edges ?? []).map((e) =>
            withEdgeHandlers(migrateEdge(e), edgeLabelChangeRef),
          ),
        );
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setMenu(null);
        clearHistory();
        dragHistoryCaptured.current = false;
        resizeHistoryCaptured.current = false;
        setStatus("Ready");
        setDirty(false);
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setStatus(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [project.id, flowchartId, setNodes, setEdges, clearHistory]);

  const selectFlowchart = (id: string, nextName: string) => {
    if (id === flowchartId) {
      setName(nextName);
      return;
    }
    setFlowchartId(id);
    setName(nextName);
  };

  // Sidebar Description (and Rename) edit the same JSON the canvas autosaves.
  // Keep descriptionRef / name in sync so the next canvas persist does not wipe them.
  useEffect(() => {
    return onFlowchartSaved((detail) => {
      if (detail.projectId !== project.id || detail.flowchartId !== flowchartId) {
        return;
      }
      const nextDescription = detail.document.description ?? "";
      if (descriptionRef.current !== nextDescription) {
        descriptionRef.current = nextDescription;
      }
      const nextName = detail.document.name || flowchartId;
      if (nameRef.current !== nextName) {
        setName(nextName);
      }
    });
  }, [project.id, flowchartId]);

  useEffect(() => {
    if (!focusFlowchartId || focusFlowchartId === flowchartId) return;
    setFlowchartId(focusFlowchartId);
  }, [focusFlowchartId, flowchartId]);

  const applySnapshot = useCallback(
    (snap: FlowSnapshot) => {
      applyingHistory.current = true;
      setName(snap.name);
      nameRef.current = snap.name;
      descriptionRef.current = snap.description;
      const restoredNodes = cloneFlowNodes(snap.nodes).map((n) =>
        withNodeHandlers(
          n,
          setNodes,
          queueSaveRef,
          edgesRef,
          recordHistoryRef,
          quickAddRef,
        ),
      );
      const restoredEdges = cloneFlowEdges(snap.edges).map((e) =>
        withEdgeHandlers(e, edgeLabelChangeRef),
      );
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      queueSave(restoredNodes, restoredEdges);
      applyingHistory.current = false;
    },
    [queueSave, setNodes, setEdges],
  );

  const handleUndo = useCallback(() => {
    const prev = undoHistory(takeSnapshot());
    if (!prev) return;
    applySnapshot(prev);
    setStatus("Undid last flowchart edit");
  }, [undoHistory, takeSnapshot, applySnapshot]);

  const handleRedo = useCallback(() => {
    const next = redoHistory(takeSnapshot());
    if (!next) return;
    applySnapshot(next);
    setStatus("Redid flowchart edit");
  }, [redoHistory, takeSnapshot, applySnapshot]);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".flowchart-ctx-menu")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeT>[]) => {
      const nds = nodesRef.current;
      const guides: SnapGuide[] = [];
      let dragging = false;
      let dragEnded = false;
      const startingDrag = changes.some(
        (c) => c.type === "position" && c.dragging === true,
      );
      const endingDrag = changes.some(
        (c) => c.type === "position" && c.dragging === false,
      );
      const resizing = changes.some((c) => c.type === "dimensions");

      if (startingDrag && !dragHistoryCaptured.current) {
        recordHistory();
        dragHistoryCaptured.current = true;
      }
      if (endingDrag) dragHistoryCaptured.current = false;
      if (resizing && !resizeHistoryCaptured.current) {
        // dimensions fire repeatedly while resizing — capture once per gesture
        const dimChange = changes.find((c) => c.type === "dimensions");
        if (
          dimChange &&
          dimChange.type === "dimensions" &&
          dimChange.resizing !== false
        ) {
          recordHistory();
          resizeHistoryCaptured.current = true;
        }
      }
      if (
        changes.some(
          (c) =>
            c.type === "dimensions" &&
            "resizing" in c &&
            c.resizing === false,
        )
      ) {
        resizeHistoryCaptured.current = false;
      }
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        // Coalesce with paired edge removes from the same Delete gesture.
        recordHistory({ coalesce: true, coalesceMs: 50 });
      }

      const snappedChanges = changes.map((change) => {
        if (change.type === "position" && change.position) {
          if (change.dragging) dragging = true;
          if (change.dragging === false) dragEnded = true;
          const moving = nds.find((n) => n.id === change.id);
          if (!moving) return change;
          const box = nodeBox(moving);
          // While multi-dragging, ignore other selected peers so the group
          // does not snap nodes apart against each other.
          const movingSelected = Boolean(moving.selected);
          const others = nds
            .filter(
              (n) =>
                n.id !== change.id && !(movingSelected && n.selected),
            )
            .map((n) => nodeBox(n));
          const snapped = snapDragPosition(
            change.position,
            { width: box.width, height: box.height },
            others,
          );
          if (change.dragging) guides.push(...snapped.guides);
          return {
            ...change,
            position: { x: snapped.x, y: snapped.y },
          };
        }
        if (change.type === "dimensions" && change.dimensions) {
          const sized = snapSize(
            change.dimensions.width,
            change.dimensions.height,
          );
          return {
            ...change,
            dimensions: sized,
          };
        }
        return change;
      });

      if (dragging) setSnapGuides(guides);
      else if (dragEnded) setSnapGuides([]);

      setNodes((prev) => {
        const next = applyNodeChanges(snappedChanges, prev);
        const withSyncedSize = next.map((n) => {
          const dim = snappedChanges.find(
            (c) => c.type === "dimensions" && c.id === n.id,
          );
          if (!dim || dim.type !== "dimensions" || !dim.dimensions) return n;
          return {
            ...n,
            width: dim.dimensions.width,
            height: dim.dimensions.height,
            style: {
              ...n.style,
              width: dim.dimensions.width,
              height: dim.dimensions.height,
            },
          };
        });
        const meaningful = snappedChanges.some(
          (c) =>
            c.type === "remove" ||
            c.type === "add" ||
            c.type === "dimensions" ||
            (c.type === "position" && c.dragging === false),
        );
        if (meaningful) queueSave(withSyncedSize, edgesRef.current);
        return withSyncedSize;
      });
    },
    [setNodes, queueSave, recordHistory],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        recordHistory({ coalesce: true, coalesceMs: 50 });
      }
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        const meaningful = changes.some(
          (c) => c.type === "remove" || c.type === "add",
        );
        if (meaningful) queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave, recordHistory],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Require explicit anchors so edges stay locked to N/E/S/W handles.
      if (!connection.sourceHandle || !connection.targetHandle) return;
      const path = defaultEdgePathRef.current;
      const startArrow = defaultStartArrowRef.current;
      const endArrow = defaultEndArrowRef.current;
      recordHistory();
      setEdges((eds) => {
        const created = withEdgeHandlers(
          {
            ...connection,
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`,
            type: edgeTypeForPath(path),
            markerStart: markerForArrow(startArrow),
            markerEnd: markerForArrow(endArrow),
            data: { path, startArrow, endArrow },
          },
          edgeLabelChangeRef,
        );
        const next = addEdge(created, eds);
        queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave, recordHistory],
  );

  const onReconnect = useCallback(
    (oldEdge: FlowEdge, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Same anchor rule as new connections — keep edges locked to N/E/S/W.
      if (!connection.sourceHandle || !connection.targetHandle) return;
      recordHistory();
      setEdges((eds) => {
        // reconnectEdge keeps type / markers / data / label from oldEdge.
        const next = reconnectEdge(oldEdge, connection, eds, {
          shouldReplaceId: false,
        });
        queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave, recordHistory],
  );

  const selectedNodes = nodes.filter(
    (n) => n.selected || n.id === selectedNodeId,
  );
  const selectedEdges = edges.filter(
    (e) => e.selected || e.id === selectedEdgeId,
  );
  /** Primary selection for single-value toolbar affordances (rename, etc.). */
  const selectedNode = selectedNodes[0] ?? null;
  const selectedEdge = selectedEdges[0] ?? null;
  const multiNodeSelection = selectedNodes.length > 1;
  const sharedNodeKind =
    selectedNodes.length > 0 &&
    selectedNodes.every((n) => n.data.kind === selectedNodes[0].data.kind)
      ? selectedNodes[0].data.kind
      : null;
  const sharedNodeShape =
    selectedNodes.length > 0 &&
    selectedNodes.every((n) => n.data.shape === selectedNodes[0].data.shape)
      ? selectedNodes[0].data.shape
      : null;
  const sharedNodeFill =
    selectedNodes.length > 0 &&
    selectedNodes.every((n) => n.data.fill === selectedNodes[0].data.fill)
      ? selectedNodes[0].data.fill
      : null;
  const sharedEdgePath =
    selectedEdges.length > 0 &&
    selectedEdges.every(
      (e) => (e.data?.path ?? "step") === (selectedEdges[0].data?.path ?? "step"),
    )
      ? (selectedEdges[0].data?.path ?? "step")
      : null;
  const sharedStartArrow =
    selectedEdges.length > 0 &&
    selectedEdges.every(
      (e) => Boolean(e.data?.startArrow) === Boolean(selectedEdges[0].data?.startArrow),
    )
      ? Boolean(selectedEdges[0].data?.startArrow)
      : null;
  const sharedEndArrow =
    selectedEdges.length > 0 &&
    selectedEdges.every(
      (e) =>
        (e.data?.endArrow !== false) ===
        (selectedEdges[0].data?.endArrow !== false),
    )
      ? selectedEdges[0].data?.endArrow !== false
      : null;

  /** Patch every selected node (marquee / Shift+click multi-select). */
  const patchSelectedNodes = (
    patch: Partial<FlowNodeT["data"]> & {
      width?: number;
      height?: number;
    },
  ) => {
    if (selectedNodes.length === 0) return;
    recordHistory();
    const targetIds = new Set(selectedNodes.map((n) => n.id));
    setNodes((prev) => {
      const next = prev.map((n) => {
        if (!targetIds.has(n.id)) return n;
        const data = { ...n.data, ...patch };
        const width =
          patch.width ??
          Number(n.style?.width ?? n.width ?? defaultSizeFor(data.kind, data.shape).width);
        const height =
          patch.height ??
          Number(n.style?.height ?? n.height ?? defaultSizeFor(data.kind, data.shape).height);
        return {
          ...n,
          style: { ...n.style, width, height },
          data,
        };
      });
      queueSave(next, edgesRef.current);
      return next;
    });
  };

  /** Patch every selected edge. */
  const patchSelectedEdges = (patch: {
    path?: FlowEdgePath;
    startArrow?: boolean;
    endArrow?: boolean;
  }) => {
    if (selectedEdges.length === 0) return;
    recordHistory();
    const targetIds = new Set(selectedEdges.map((e) => e.id));
    setEdges((eds) => {
      const next = eds.map((e) => {
        if (!targetIds.has(e.id)) return e;
        const nextPath = patch.path ?? e.data?.path ?? "step";
        const startArrow = patch.startArrow ?? e.data?.startArrow ?? false;
        const endArrow = patch.endArrow ?? e.data?.endArrow ?? true;
        return withEdgeHandlers(
          {
            ...e,
            type: edgeTypeForPath(nextPath),
            markerStart: markerForArrow(startArrow),
            markerEnd: markerForArrow(endArrow),
            data: {
              path: nextPath,
              startArrow,
              endArrow,
              startEditToken: e.data?.startEditToken,
            },
          },
          edgeLabelChangeRef,
        );
      });
      queueSave(nodesRef.current, next);
      return next;
    });
  };

  const addNode = (kind: FlowNodeKind, shapeOverride?: FlowNodeShape) => {
    const defaults = kindDefaults(kind);
    const shape = shapeOverride ?? defaults.defaultShape;
    const id = `n-${idCounter.current++}`;
    const index = idCounter.current - 1;
    const size = defaultSizeFor(kind, shape);
    const origin =
      rfRef.current?.screenToFlowPosition({
        x: window.innerWidth / 2 - 80,
        y: window.innerHeight / 2 - 120,
      }) ?? { x: 80, y: 60 };
    const position = {
      x: origin.x + ((index - 1) % 3) * 200,
      y: origin.y + Math.floor((index - 1) / 3) * 150,
    };

    recordHistory();
    setNodes((nds) => {
      const base = migrateNode({
        id,
        position,
        data: {
          label: `${defaults.defaultLabel}${kind === "process" || kind === "state" ? ` ${index}` : ""}`,
          kind,
          shape,
          fill: defaults.defaultFill,
          width: size.width,
          height: size.height,
        },
      });
      const next = [
        ...nds,
        withNodeHandlers(
          base,
          setNodes,
          queueSaveRef,
          edgesRef,
          recordHistoryRef,
          quickAddRef,
        ),
      ];
      queueSave(next, edgesRef.current);
      return next;
    });
  };

  /**
   * Semantic type chip: selected → set kind + that kind’s default shape
   * (Decision→diamond, Start/End→ellipse, …); none selected → create.
   */
  const applyOrCreateKind = (kind: FlowNodeKind) => {
    if (selectedNodes.length > 0) {
      const defaults = kindDefaults(kind);
      const shape = defaults.defaultShape;
      const size = defaultSizeFor(kind, shape);
      const targetIds = new Set(selectedNodes.map((n) => n.id));
      recordHistory();
      setNodes((prev) => {
        const next = prev.map((n) => {
          if (!targetIds.has(n.id)) return n;
          const data = {
            ...n.data,
            kind,
            shape,
            // Keep each node’s fill when already set; only fill blanks from kind defaults.
            fill: n.data.fill ?? defaults.defaultFill,
          };
          return {
            ...n,
            style: { ...n.style, width: size.width, height: size.height },
            data,
          };
        });
        queueSave(next, edgesRef.current);
        return next;
      });
      return;
    }
    addNode(kind);
  };

  /**
   * Base shape chip: selected → geometry only (kind unchanged, size kept);
   * none selected → create an Action node with that shape.
   */
  const applyOrCreateShape = (shape: FlowNodeShape) => {
    if (selectedNodes.length > 0) {
      patchSelectedNodes({ shape });
      return;
    }
    addNode("process", shape);
  };

  /** Connector chips: selected edges → patch; none → update new-connection defaults. */
  const applyOrSetEdgePath = (path: FlowEdgePath) => {
    if (selectedEdges.length > 0) {
      patchSelectedEdges({ path });
      return;
    }
    setDefaultEdgePath(path);
  };

  const applyOrToggleStartArrow = () => {
    if (selectedEdges.length > 0) {
      patchSelectedEdges({
        startArrow: !(sharedStartArrow ?? false),
      });
      return;
    }
    setDefaultStartArrow((v) => !v);
  };

  const applyOrToggleEndArrow = () => {
    if (selectedEdges.length > 0) {
      patchSelectedEdges({
        endArrow: !(sharedEndArrow ?? true),
      });
      return;
    }
    setDefaultEndArrow((v) => !v);
  };

  const selectedNodeIdSet = useCallback(() => {
    return new Set(
      nodesRef.current
        .filter((n) => n.selected || n.id === selectedNodeId)
        .map((n) => n.id),
    );
  }, [selectedNodeId]);

  const attachHandlers = useCallback(
    (node: FlowNodeT): FlowNodeT =>
      withNodeHandlers(
        node,
        setNodes,
        queueSaveRef,
        edgesRef,
        recordHistoryRef,
        quickAddRef,
      ),
    [setNodes],
  );

  const mergePastedSubgraph = useCallback(
    (payload: FlowClipboardPayload) => {
      const cloned = cloneClipboardPayload(payload, {
        nextNodeId: () => `n-${idCounter.current++}`,
        nextEdgeId: (source, sourceHandle, target, targetHandle) =>
          `e-${source}-${sourceHandle ?? "h"}-${target}-${targetHandle ?? "h"}-${Date.now()}`,
      });
      recordHistory();
      setNodes((prev) => {
        const cleared = prev.map((n) => ({ ...n, selected: false }));
        const added = cloned.nodes.map((n) => attachHandlers(n));
        const next = [...cleared, ...added];
        setEdges((eds) => {
          const nextEdges = [
            ...eds.map((e) => ({ ...e, selected: false })),
            ...cloned.edges.map((e) =>
              withEdgeHandlers(e, edgeLabelChangeRef),
            ),
          ];
          queueSave(next, nextEdges);
          return nextEdges;
        });
        return next;
      });
      setSelectedNodeId(cloned.nodes[0]?.id ?? null);
      setSelectedEdgeId(null);
      setStatus(
        cloned.nodes.length === 1
          ? "Pasted node"
          : `Pasted ${cloned.nodes.length} nodes`,
      );
    },
    [attachHandlers, queueSave, recordHistory, setNodes, setEdges],
  );

  const copySelection = useCallback(
    (mode: "copy" | "cut") => {
      const ids = selectedNodeIdSet();
      const payload = extractClipboardSelection(
        nodesRef.current,
        edgesRef.current,
        ids,
      );
      if (!payload) {
        setStatus("Nothing to copy — select node(s) first");
        return false;
      }
      clipboardRef.current = { mode, payload };
      if (mode === "cut") {
        recordHistory();
        setNodes((prev) => {
          const next = prev.filter((n) => !ids.has(n.id));
          setEdges((eds) => {
            const nextEdges = eds.filter(
              (e) => !ids.has(e.source) && !ids.has(e.target),
            );
            queueSave(next, nextEdges);
            return nextEdges;
          });
          return next;
        });
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setStatus(
          payload.nodes.length === 1
            ? "Cut node"
            : `Cut ${payload.nodes.length} nodes`,
        );
      } else {
        setStatus(
          payload.nodes.length === 1
            ? "Copied node"
            : `Copied ${payload.nodes.length} nodes`,
        );
      }
      closeMenu();
      return true;
    },
    [selectedNodeIdSet, recordHistory, queueSave, setNodes, setEdges, closeMenu],
  );

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) {
      setStatus("Clipboard is empty");
      closeMenu();
      return;
    }
    mergePastedSubgraph(clip.payload);
    if (clip.mode === "cut") clipboardRef.current = null;
    closeMenu();
  }, [mergePastedSubgraph, closeMenu]);

  const duplicateSelection = useCallback(() => {
    const ids = selectedNodeIdSet();
    const payload = extractClipboardSelection(
      nodesRef.current,
      edgesRef.current,
      ids,
    );
    if (!payload) {
      setStatus("Nothing to duplicate — select node(s) first");
      return;
    }
    mergePastedSubgraph(payload);
    closeMenu();
  }, [selectedNodeIdSet, mergePastedSubgraph, closeMenu]);

  const applyNodePositions = useCallback(
    (positions: Map<string, { x: number; y: number }>, statusText: string) => {
      if (positions.size === 0) return;
      recordHistory();
      setNodes((prev) => {
        const next = prev.map((n) => {
          const pos = positions.get(n.id);
          return pos ? { ...n, position: { ...pos } } : n;
        });
        queueSave(next, edgesRef.current);
        return next;
      });
      setStatus(statusText);
      closeMenu();
    },
    [recordHistory, queueSave, setNodes, closeMenu],
  );

  const alignSelection = useCallback(
    (mode: AlignMode) => {
      const targets = nodesRef.current.filter(
        (n) => n.selected || n.id === selectedNodeId,
      );
      if (targets.length < 2) {
        setStatus("Select 2+ nodes to align");
        return;
      }
      applyNodePositions(
        alignNodePositions(targets, mode),
        `Aligned ${targets.length} nodes`,
      );
    },
    [applyNodePositions, selectedNodeId],
  );

  const distributeSelection = useCallback(
    (axis: DistributeAxis) => {
      const targets = nodesRef.current.filter(
        (n) => n.selected || n.id === selectedNodeId,
      );
      if (targets.length < 3) {
        setStatus("Select 3+ nodes to distribute");
        return;
      }
      applyNodePositions(
        distributeNodePositions(targets, axis),
        `Distributed ${targets.length} nodes`,
      );
    },
    [applyNodePositions, selectedNodeId],
  );

  const deleteSelected = useCallback(() => {
    const nodeIds = new Set(
      nodesRef.current
        .filter((n) => n.selected || n.id === selectedNodeId)
        .map((n) => n.id),
    );
    const edgeIds = new Set(
      edgesRef.current
        .filter((e) => e.selected || e.id === selectedEdgeId)
        .map((e) => e.id),
    );
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    recordHistory();
    setNodes((nds) => {
      const next = nds.filter((n) => !nodeIds.has(n.id));
      setEdges((eds) => {
        const nextEdges = eds.filter(
          (e) =>
            !edgeIds.has(e.id) &&
            !nodeIds.has(e.source) &&
            !nodeIds.has(e.target),
        );
        queueSave(next, nextEdges);
        return nextEdges;
      });
      return next;
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    closeMenu();
  }, [selectedNodeId, selectedEdgeId, recordHistory, queueSave, setNodes, setEdges, closeMenu]);

  const renameSelectedNode = useCallback(() => {
    const node =
      selectedNode ??
      nodesRef.current.find((n) => n.selected) ??
      nodesRef.current[0];
    if (!node) return;
    const nextLabel = window.prompt("Node label", node.data.label ?? "");
    if (nextLabel === null) return;
    // Rename applies to the primary selection only (prompt is one label).
    const label = nextLabel.trim() || "Node";
    recordHistory();
    setNodes((prev) => {
      const next = prev.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, label } } : n,
      );
      queueSave(next, edgesRef.current);
      return next;
    });
    closeMenu();
  }, [selectedNode, recordHistory, queueSave, setNodes, closeMenu]);

  /** Open inline label editor on the canvas (no window.prompt). */
  const editEdgeLabel = useCallback(
    (edgeId?: string) => {
      const edge =
        (edgeId
          ? edgesRef.current.find((e) => e.id === edgeId)
          : null) ?? selectedEdge;
      if (!edge) return;
      const token = Date.now();
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edge.id
            ? withEdgeHandlers(
                {
                  ...e,
                  selected: true,
                  data: {
                    path: e.data?.path ?? "step",
                    startArrow: e.data?.startArrow ?? false,
                    endArrow: e.data?.endArrow !== false,
                    startEditToken: token,
                  },
                },
                edgeLabelChangeRef,
              )
            : e,
        ),
      );
      setSelectedEdgeId(edge.id);
      closeMenu();
    },
    [selectedEdge, setEdges, closeMenu],
  );

  const commitEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      recordHistory();
      setEdges((eds) => {
        const next = eds.map((e) =>
          e.id === edgeId
            ? withEdgeHandlers(
                {
                  ...e,
                  label: label.trim() || undefined,
                  data: {
                    path: e.data?.path ?? "step",
                    startArrow: e.data?.startArrow ?? false,
                    endArrow: e.data?.endArrow !== false,
                    // Clear token so a later toolbar click can re-open edit.
                    startEditToken: undefined,
                  },
                },
                edgeLabelChangeRef,
              )
            : e,
        );
        queueSave(nodesRef.current, next);
        return next;
      });
      setStatus(label.trim() ? "Edge label updated" : "Edge label cleared");
    },
    [recordHistory, queueSave, setEdges],
  );

  edgeLabelChangeRef.current = commitEdgeLabel;

  const handleQuickAdd = useCallback(
    (nodeId: string, handleId: string) => {
      if (!isFlowAnchorId(handleId)) return;
      const source = nodesRef.current.find((n) => n.id === nodeId);
      if (!source) return;
      const box = nodeBox(source);
      const kind = source.data.kind;
      const shape = source.data.shape;
      const fill = source.data.fill;
      const size = {
        width: box.width,
        height: box.height,
      };
      const position = quickAddPosition(box, handleId, size);
      const defaults = kindDefaults(kind);
      const id = `n-${idCounter.current++}`;
      const index = idCounter.current - 1;
      const targetHandle = oppositeAnchor(handleId);
      const path = defaultEdgePathRef.current;
      const startArrow = defaultStartArrowRef.current;
      const endArrow = defaultEndArrowRef.current;

      recordHistory();
      setNodes((nds) => {
        const cleared = nds.map((n) => ({ ...n, selected: false }));
        const base = migrateNode({
          id,
          position,
          data: {
            label: `${defaults.defaultLabel}${
              kind === "process" || kind === "state" ? ` ${index}` : ""
            }`,
            kind,
            shape,
            fill,
            width: size.width,
            height: size.height,
          },
        });
        const created = {
          ...attachHandlers(base),
          selected: true,
        };
        const next = [...cleared, created];
        setEdges((eds) => {
          const nextEdges = [
            ...eds.map((e) => ({ ...e, selected: false })),
            withEdgeHandlers(
              {
                id: `e-${nodeId}-${handleId}-${id}-${targetHandle}-${Date.now()}`,
                source: nodeId,
                target: id,
                sourceHandle: handleId,
                targetHandle,
                type: edgeTypeForPath(path),
                markerStart: markerForArrow(startArrow),
                markerEnd: markerForArrow(endArrow),
                data: { path, startArrow, endArrow },
              } satisfies FlowEdge,
              edgeLabelChangeRef,
            ),
          ];
          queueSave(next, nextEdges);
          return nextEdges;
        });
        return next;
      });
      setSelectedNodeId(id);
      setSelectedEdgeId(null);
      setStatus("Added connected node");
    },
    [attachHandlers, queueSave, recordHistory, setNodes, setEdges],
  );

  quickAddRef.current = handleQuickAdd;

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;

      const undoAction = undoRedoFromKeyboard(event);
      if (undoAction === "undo" && canUndo) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (undoAction === "redo" && canRedo) {
        event.preventDefault();
        handleRedo();
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        copySelection("copy");
      } else if (key === "x") {
        event.preventDefault();
        copySelection("cut");
      } else if (key === "v") {
        event.preventDefault();
        pasteClipboard();
      } else if (key === "d") {
        event.preventDefault();
        duplicateSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    active,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    copySelection,
    pasteClipboard,
    duplicateSelection,
  ]);

  const ensureNodeSelected = (nodeId: string) => {
    const already =
      nodesRef.current.some((n) => n.id === nodeId && n.selected) ||
      selectedNodeId === nodeId;
    if (already) return;
    setNodes((prev) =>
      prev.map((n) => ({ ...n, selected: n.id === nodeId })),
    );
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  };

  const ensureEdgeSelected = (edgeId: string) => {
    const already =
      edgesRef.current.some((e) => e.id === edgeId && e.selected) ||
      selectedEdgeId === edgeId;
    if (already) return;
    setEdges((prev) =>
      prev.map((e) => ({ ...e, selected: e.id === edgeId })),
    );
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  };

  return (
    <section className="flowchart-shell" aria-label="Flowchart editor">
      <SplitPane
        id="flowchart.sidebar"
        defaultSize={210}
        minSize={140}
        maxSize={420}
        minSecondary={320}
        stackBelow={840}
        className="flowchart-split"
      >
        <FlowchartSidebar
          project={project}
          activeId={flowchartId}
          onSelect={selectFlowchart}
        />
        <div className="flowchart-main">
      <header className="flowchart-toolbar" role="toolbar">
        <div className="flowchart-toolbar-left">
          <strong>{name}</strong>
          <span className="muted tiny">{dirty ? "Unsaved…" : status}</span>
        </div>
        <div className="flowchart-toolbar-actions">
          <UndoRedoButtons
            variant="text"
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
          <button
            type="button"
            onClick={renameSelectedNode}
            disabled={!selectedNode && nodes.length === 0}
          >
            Rename node
          </button>
          <button
            type="button"
            onClick={() => editEdgeLabel()}
            disabled={!selectedEdge}
            title="Edit selected connector label inline (or double-click the connector)"
          >
            Edge label
          </button>
          <button
            type="button"
            onClick={duplicateSelection}
            disabled={selectedNodes.length === 0}
            title="Duplicate selection (Ctrl/Cmd+D)"
          >
            Duplicate
          </button>
          <button type="button" onClick={deleteSelected}>
            Delete
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void persist(nodes, edges, viewportRef.current)}
          >
            Save now
          </button>
        </div>
      </header>

      <div className="flowchart-style-bar" aria-label="Flowchart controls">
        <div
          className="style-group flowchart-node-chips"
          role="group"
          aria-label={
            selectedNodes.length > 1
              ? "Change selected nodes"
              : selectedNode
                ? "Change selected node"
                : "Create node"
          }
        >
          <span className="muted tiny">Nodes</span>
          {NODE_KIND_OPTIONS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={
                sharedNodeKind === k.kind
                  ? "chip active"
                  : selectedNode
                    ? "chip"
                    : "chip type-chip"
              }
              title={
                multiNodeSelection
                  ? `Change ${selectedNodes.length} selected nodes to ${k.label}`
                  : selectedNode
                    ? `Change selected node to ${k.label}`
                    : `Create ${k.label} node`
              }
              onClick={() => applyOrCreateKind(k.kind)}
            >
              {k.label}
            </button>
          ))}
          <span className="chip-sep" aria-hidden="true" />
          {SHAPE_OPTIONS.map((shape) => (
            <button
              key={shape}
              type="button"
              className={
                sharedNodeShape === shape
                  ? "chip active"
                  : selectedNode
                    ? "chip"
                    : "chip type-chip"
              }
              title={
                multiNodeSelection
                  ? `Set ${selectedNodes.length} selected nodes to ${shape}`
                  : selectedNode
                    ? `Set selected node shape to ${shape}`
                    : `Create Action node as ${shape}`
              }
              onClick={() => applyOrCreateShape(shape)}
            >
              {shape}
            </button>
          ))}
        </div>
        <div className="style-group colors">
          <span className="muted tiny">Color</span>
          {COLOR_PALETTE.map((fill) => (
            <button
              key={fill}
              type="button"
              className={sharedNodeFill === fill ? "swatch active" : "swatch"}
              style={{ background: fill }}
              disabled={!selectedNode}
              aria-label={`Fill ${fill}`}
              onClick={() => patchSelectedNodes({ fill })}
            />
          ))}
        </div>
        <div
          className="style-group flowchart-arrange-chips"
          role="group"
          aria-label="Align and distribute selected nodes"
        >
          <span className="muted tiny">Arrange</span>
          {(
            [
              ["left", "L"],
              ["center", "C"],
              ["right", "R"],
              ["top", "T"],
              ["middle", "M"],
              ["bottom", "B"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className="chip"
              disabled={selectedNodes.length < 2}
              title={
                selectedNodes.length < 2
                  ? "Select 2+ nodes to align"
                  : `Align ${mode}`
              }
              onClick={() => alignSelection(mode)}
            >
              {label}
            </button>
          ))}
          <span className="chip-sep" aria-hidden="true" />
          <button
            type="button"
            className="chip"
            disabled={selectedNodes.length < 3}
            title={
              selectedNodes.length < 3
                ? "Select 3+ nodes to distribute"
                : "Distribute horizontal gaps"
            }
            onClick={() => distributeSelection("horizontal")}
          >
            Dist H
          </button>
          <button
            type="button"
            className="chip"
            disabled={selectedNodes.length < 3}
            title={
              selectedNodes.length < 3
                ? "Select 3+ nodes to distribute"
                : "Distribute vertical gaps"
            }
            onClick={() => distributeSelection("vertical")}
          >
            Dist V
          </button>
        </div>
        <div
          className="style-group flowchart-connector-chips"
          role="group"
          aria-label={
            selectedEdges.length > 0
              ? "Change selected connectors"
              : "Defaults for new connectors"
          }
        >
          <span className="muted tiny">Connector</span>
          <button
            type="button"
            className={
              (selectedEdges.length > 0
                ? sharedEdgePath === "curve"
                : defaultEdgePath === "curve")
                ? "chip active"
                : selectedEdges.length > 0
                  ? "chip"
                  : "chip type-chip"
            }
            title={
              selectedEdges.length > 0
                ? "Set selected connectors to curved"
                : "New connectors will be curved"
            }
            onClick={() => applyOrSetEdgePath("curve")}
          >
            Curved
          </button>
          <button
            type="button"
            className={
              (selectedEdges.length > 0
                ? sharedEdgePath === "step"
                : defaultEdgePath === "step")
                ? "chip active"
                : selectedEdges.length > 0
                  ? "chip"
                  : "chip type-chip"
            }
            title={
              selectedEdges.length > 0
                ? "Set selected connectors to angled"
                : "New connectors will be angled"
            }
            onClick={() => applyOrSetEdgePath("step")}
          >
            Angled
          </button>
          <span className="chip-sep" aria-hidden="true" />
          <button
            type="button"
            className={
              (selectedEdges.length > 0
                ? Boolean(sharedStartArrow)
                : defaultStartArrow)
                ? "chip active"
                : selectedEdges.length > 0
                  ? "chip"
                  : "chip type-chip"
            }
            aria-pressed={
              selectedEdges.length > 0
                ? Boolean(sharedStartArrow)
                : defaultStartArrow
            }
            title={
              selectedEdges.length > 0
                ? "Toggle start arrow on selected connectors"
                : "Toggle start arrow for new connectors"
            }
            onClick={applyOrToggleStartArrow}
          >
            Start arrow
          </button>
          <button
            type="button"
            className={
              (selectedEdges.length > 0
                ? Boolean(sharedEndArrow)
                : defaultEndArrow)
                ? "chip active"
                : selectedEdges.length > 0
                  ? "chip"
                  : "chip type-chip"
            }
            aria-pressed={
              selectedEdges.length > 0
                ? Boolean(sharedEndArrow)
                : defaultEndArrow
            }
            title={
              selectedEdges.length > 0
                ? "Toggle end arrow on selected connectors"
                : "Toggle end arrow for new connectors"
            }
            onClick={applyOrToggleEndArrow}
          >
            End arrow
          </button>
        </div>
      </div>

      <p className="muted tiny flowchart-hint">
        Miro-like select: drag empty canvas to marquee-select nodes and
        connectors · click selects · Shift+click adds/toggles · drag selection
        to move · click empty clears · Space+drag or middle-mouse to pan ·
        Ctrl/Cmd+C/X/V/D copy cut paste duplicate · Arrange aligns/distributes
        multi-select · click an N/E/S/W anchor to quick-add a connected node
        (drag to connect) · double-click a connector to edit its label inline ·
        right-click for context menu · Node chips create or change selection ·
        Connector chips change edges or set defaults (angled + end arrow) ·
        nodes snap to a {GRID_SIZE}px grid. Autosaves into this project.
      </p>

      {!ready ? (
        <p className="muted flowchart-status">{status}</p>
      ) : (
        <div className="flowchart-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            edgesReconnectable
            reconnectRadius={24}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              type: edgeTypeForPath(defaultEdgePath),
              markerStart: markerForArrow(defaultStartArrow),
              markerEnd: markerForArrow(defaultEndArrow),
              data: {
                path: defaultEdgePath,
                startArrow: defaultStartArrow,
                endArrow: defaultEndArrow,
              },
            }}
            fitView={nodes.length > 0}
            defaultViewport={viewportRef.current}
            onInit={(instance) => {
              rfRef.current = instance;
            }}
            onMoveEnd={(_, vp) => {
              viewportRef.current = vp;
            }}
            onSelectionChange={({ nodes: selNodes, edges: selEdges }) => {
              setSelectedNodeId(selNodes[0]?.id ?? null);
              setSelectedEdgeId(selEdges[0]?.id ?? null);
            }}
            onNodeContextMenu={(event, node) => {
              event.preventDefault();
              ensureNodeSelected(node.id);
              setMenu({
                x: event.clientX,
                y: event.clientY,
                target: "node",
                nodeId: node.id,
              });
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault();
              ensureEdgeSelected(edge.id);
              setMenu({
                x: event.clientX,
                y: event.clientY,
                target: "edge",
                edgeId: edge.id,
              });
            }}
            onEdgeDoubleClick={(event, edge) => {
              event.preventDefault();
              ensureEdgeSelected(edge.id);
              editEdgeLabel(edge.id);
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              setMenu({
                x: event.clientX,
                y: event.clientY,
                target: "pane",
              });
            }}
            /* Miro-like: left-drag selects; Space+drag / middle-mouse pans (not left-drag). */
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            selectionKeyCode={null}
            multiSelectionKeyCode="Shift"
            panOnDrag={[1]}
            panActivationKeyCode="Space"
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <SnapGuides guides={snapGuides} />
            <Background gap={GRID_SIZE} size={1} color="#4a4a4a" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      )}

      {menu && (
        <div
          className="flowchart-ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {menu.target === "node" && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={duplicateSelection}
              >
                Duplicate
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => copySelection("copy")}
              >
                Copy
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => copySelection("cut")}
              >
                Cut
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={renameSelectedNode}
              >
                Rename…
              </button>
              <hr className="flowchart-ctx-sep" />
              <button
                type="button"
                role="menuitem"
                className="danger-outline"
                onClick={deleteSelected}
              >
                Delete
              </button>
            </>
          )}
          {menu.target === "edge" && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => editEdgeLabel(menu.edgeId)}
              >
                Edit label…
              </button>
              <hr className="flowchart-ctx-sep" />
              <button
                type="button"
                role="menuitem"
                className="danger-outline"
                onClick={deleteSelected}
              >
                Delete
              </button>
            </>
          )}
          {menu.target === "pane" && (
            <button type="button" role="menuitem" onClick={pasteClipboard}>
              Paste
            </button>
          )}
        </div>
      )}
        </div>
      </SplitPane>
    </section>
  );
}
