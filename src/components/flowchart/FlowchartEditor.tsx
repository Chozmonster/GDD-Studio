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
  emitFlowchartSaved,
} from "../../lib/flowchartEvents";

type FlowchartEditorProps = {
  project: ProjectRecord;
  /** When set (e.g. from a document embed Open), select that flowchart. */
  focusFlowchartId?: string | null;
};

const nodeTypes = { flow: FlowNode, labeled: FlowNode };
const edgeTypes = { stubCurve: StubCurveEdge, stubStep: StubStepEdge };

function toDoc(
  id: string,
  name: string,
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
): FlowchartDocument {
  return {
    format: "gdd-studio-flowchart",
    version: 2,
    id,
    name,
    nodes: nodes.map(serializeNode),
    edges: edges.map(serializeEdge),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  };
}

function withLabelHandler(
  node: ReturnType<typeof migrateNode>,
  setNodes: Dispatch<SetStateAction<FlowNodeT[]>>,
  queueSaveRef: MutableRefObject<(nodes: Node[], edges: Edge[]) => void>,
  edgesRef: MutableRefObject<FlowEdge[]>,
): FlowNodeT {
  return {
    ...node,
    data: {
      ...node.data,
      onChangeLabel: (nodeId: string, label: string) => {
        setNodes((prev) => {
          const next = prev.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
          );
          queueSaveRef.current(next, edgesRef.current);
          return next;
        });
      },
    },
  };
}

export function FlowchartEditor({
  project,
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
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const rfRef = useRef<ReactFlowInstance<FlowNodeT, FlowEdge> | null>(null);
  const saveTimer = useRef<number | null>(null);
  const idCounter = useRef(1);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const nameRef = useRef(name);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  nameRef.current = name;

  const persist = useCallback(
    async (nextNodes: Node[], nextEdges: Edge[], vp: Viewport) => {
      const doc = toDoc(flowchartId, nameRef.current, nextNodes, nextEdges, vp);
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
        viewportRef.current = doc.viewport ?? { x: 0, y: 0, zoom: 1 };
        const loaded = (doc.nodes ?? []).map((n) =>
          withLabelHandler(
            migrateNode(n),
            setNodes,
            queueSaveRef,
            edgesRef,
          ),
        );
        idCounter.current =
          loaded.reduce((max, n) => {
            const m = /^n-(\d+)$/.exec(n.id);
            return m ? Math.max(max, Number(m[1])) : max;
          }, 0) + 1;
        setNodes(loaded);
        setEdges((doc.edges ?? []).map((e) => migrateEdge(e)));
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
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
  }, [project.id, flowchartId, setNodes, setEdges]);

  const selectFlowchart = (id: string, nextName: string) => {
    if (id === flowchartId) {
      setName(nextName);
      return;
    }
    setFlowchartId(id);
    setName(nextName);
  };

  useEffect(() => {
    if (!focusFlowchartId || focusFlowchartId === flowchartId) return;
    setFlowchartId(focusFlowchartId);
  }, [focusFlowchartId, flowchartId]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeT>[]) => {
      const nds = nodesRef.current;
      const guides: SnapGuide[] = [];
      let dragging = false;
      let dragEnded = false;

      const snappedChanges = changes.map((change) => {
        if (change.type === "position" && change.position) {
          if (change.dragging) dragging = true;
          if (change.dragging === false) dragEnded = true;
          const moving = nds.find((n) => n.id === change.id);
          if (!moving) return change;
          const box = nodeBox(moving);
          const others = nds
            .filter((n) => n.id !== change.id)
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
    [setNodes, queueSave],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        const meaningful = changes.some(
          (c) => c.type === "remove" || c.type === "add",
        );
        if (meaningful) queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Require explicit anchors so edges stay locked to N/E/S/W handles.
      if (!connection.sourceHandle || !connection.targetHandle) return;
      setEdges((eds) => {
        const next = addEdge(
          {
            ...connection,
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`,
            // Defaults: angled path, end arrow on, start arrow off.
            type: edgeTypeForPath("step"),
            markerStart: markerForArrow(false),
            markerEnd: markerForArrow(true),
            data: { path: "step", startArrow: false, endArrow: true },
          },
          eds,
        );
        queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave],
  );

  const onReconnect = useCallback(
    (oldEdge: FlowEdge, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Same anchor rule as new connections — keep edges locked to N/E/S/W.
      if (!connection.sourceHandle || !connection.targetHandle) return;
      setEdges((eds) => {
        // reconnectEdge keeps type / markers / data / label from oldEdge.
        const next = reconnectEdge(oldEdge, connection, eds, {
          shouldReplaceId: false,
        });
        queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave],
  );

  const selectedNode =
    nodes.find((n) => n.id === selectedNodeId) ??
    nodes.find((n) => n.selected) ??
    null;
  const selectedEdge =
    edges.find((e) => e.id === selectedEdgeId) ??
    edges.find((e) => e.selected) ??
    null;

  const patchSelectedNode = (
    patch: Partial<FlowNodeT["data"]> & {
      width?: number;
      height?: number;
    },
  ) => {
    const target = selectedNode;
    if (!target) return;
    setNodes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== target.id) return n;
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

  const patchSelectedEdge = (patch: {
    path?: FlowEdgePath;
    startArrow?: boolean;
    endArrow?: boolean;
  }) => {
    const target = selectedEdge;
    if (!target) return;
    setEdges((eds) => {
      const next = eds.map((e) => {
        if (e.id !== target.id) return e;
        const nextPath = patch.path ?? e.data?.path ?? "step";
        const startArrow = patch.startArrow ?? e.data?.startArrow ?? false;
        const endArrow = patch.endArrow ?? e.data?.endArrow ?? true;
        return {
          ...e,
          type: edgeTypeForPath(nextPath),
          markerStart: markerForArrow(startArrow),
          markerEnd: markerForArrow(endArrow),
          data: { path: nextPath, startArrow, endArrow },
        };
      });
      queueSave(nodesRef.current, next);
      return next;
    });
  };

  const addNode = (kind: FlowNodeKind) => {
    const defaults = kindDefaults(kind);
    const id = `n-${idCounter.current++}`;
    const index = idCounter.current - 1;
    const size = defaultSizeFor(kind, defaults.defaultShape);
    const origin =
      rfRef.current?.screenToFlowPosition({
        x: window.innerWidth / 2 - 80,
        y: window.innerHeight / 2 - 120,
      }) ?? { x: 80, y: 60 };
    const position = {
      x: origin.x + ((index - 1) % 3) * 200,
      y: origin.y + Math.floor((index - 1) / 3) * 150,
    };

    setNodes((nds) => {
      const base = migrateNode({
        id,
        position,
        data: {
          label: `${defaults.defaultLabel}${kind === "process" || kind === "state" ? ` ${index}` : ""}`,
          kind,
          shape: defaults.defaultShape,
          fill: defaults.defaultFill,
          width: size.width,
          height: size.height,
        },
      });
      const next = [
        ...nds,
        withLabelHandler(base, setNodes, queueSaveRef, edgesRef),
      ];
      queueSave(next, edgesRef.current);
      return next;
    });
  };

  /** One type-chip set: mutate selection when a node is selected, else create. */
  const applyOrCreateKind = (kind: FlowNodeKind) => {
    const target = selectedNode;
    if (target) {
      const defaults = kindDefaults(kind);
      const shape = defaults.defaultShape;
      const size = defaultSizeFor(kind, shape);
      patchSelectedNode({
        kind,
        shape,
        fill: target.data.fill ?? defaults.defaultFill,
        width: size.width,
        height: size.height,
      });
      return;
    }
    addNode(kind);
  };

  const deleteSelected = () => {
    setNodes((nds) => {
      const next = nds.filter((n) => !n.selected && n.id !== selectedNodeId);
      setEdges((eds) => {
        const nextEdges = eds.filter(
          (e) => !e.selected && e.id !== selectedEdgeId,
        );
        queueSave(next, nextEdges);
        return nextEdges;
      });
      return next;
    });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const renameSelectedNode = () => {
    const node = selectedNode ?? nodes[0];
    if (!node) return;
    const nextLabel = window.prompt("Node label", node.data.label ?? "");
    if (nextLabel === null) return;
    patchSelectedNode({ label: nextLabel.trim() || "Node" });
  };

  const editEdgeLabel = () => {
    const edge = selectedEdge;
    if (!edge) return;
    const nextLabel = window.prompt("Edge label", String(edge.label ?? ""));
    if (nextLabel === null) return;
    setEdges((eds) => {
      const next = eds.map((e) =>
        e.id === edge.id
          ? { ...e, label: nextLabel.trim() || undefined }
          : e,
      );
      queueSave(nodesRef.current, next);
      return next;
    });
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
          <div
            className="style-group flowchart-type-chips"
            role="group"
            aria-label={
              selectedNode
                ? "Change selected node type"
                : "Create node by type"
            }
          >
            <span className="muted tiny">Type</span>
            {NODE_KIND_OPTIONS.map((k) => (
              <button
                key={k.kind}
                type="button"
                className={
                  selectedNode?.data.kind === k.kind
                    ? "chip active"
                    : selectedNode
                      ? "chip"
                      : "chip type-chip"
                }
                title={
                  selectedNode
                    ? `Change selected node to ${k.label}`
                    : `Create ${k.label} node`
                }
                onClick={() => applyOrCreateKind(k.kind)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={renameSelectedNode}
            disabled={!selectedNode && nodes.length === 0}
          >
            Rename node
          </button>
          <button type="button" onClick={editEdgeLabel} disabled={!selectedEdge}>
            Edge label
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

      <div className="flowchart-style-bar" aria-label="Style selected">
        <div className="style-group">
          <span className="muted tiny">Shape</span>
          {SHAPE_OPTIONS.map((shape) => (
            <button
              key={shape}
              type="button"
              className={
                selectedNode?.data.shape === shape ? "chip active" : "chip"
              }
              disabled={!selectedNode}
              onClick={() => patchSelectedNode({ shape: shape as FlowNodeShape })}
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
              className={
                selectedNode?.data.fill === fill
                  ? "swatch active"
                  : "swatch"
              }
              style={{ background: fill }}
              disabled={!selectedNode}
              aria-label={`Fill ${fill}`}
              onClick={() => patchSelectedNode({ fill })}
            />
          ))}
        </div>
        <div className="style-group">
          <span className="muted tiny">Connector</span>
          <button
            type="button"
            className={
              selectedEdge?.data?.path === "curve" ? "chip active" : "chip"
            }
            disabled={!selectedEdge}
            onClick={() => patchSelectedEdge({ path: "curve" })}
          >
            Curved
          </button>
          <button
            type="button"
            className={
              selectedEdge?.data?.path === "step" ? "chip active" : "chip"
            }
            disabled={!selectedEdge}
            onClick={() => patchSelectedEdge({ path: "step" })}
          >
            Angled
          </button>
          <button
            type="button"
            className={
              selectedEdge?.data?.startArrow ? "chip active" : "chip"
            }
            disabled={!selectedEdge}
            aria-pressed={Boolean(selectedEdge?.data?.startArrow)}
            onClick={() =>
              patchSelectedEdge({
                startArrow: !selectedEdge?.data?.startArrow,
              })
            }
          >
            Start arrow
          </button>
          <button
            type="button"
            className={
              selectedEdge && selectedEdge.data?.endArrow !== false
                ? "chip active"
                : "chip"
            }
            disabled={!selectedEdge}
            aria-pressed={Boolean(
              selectedEdge && selectedEdge.data?.endArrow !== false,
            )}
            onClick={() =>
              patchSelectedEdge({
                endArrow: !(selectedEdge?.data?.endArrow !== false),
              })
            }
          >
            End arrow
          </button>
        </div>
      </div>

      <p className="muted tiny flowchart-hint">
        Type chips create a node when nothing is selected, or change the
        selected node’s type · shape / color style the selection · drag N/E/S/W
        anchors to connect (angled + end arrow by default) · drag a connector
        end to reattach it · select a connector for path and start/end arrows ·
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
              type: "stubStep",
              markerStart: markerForArrow(false),
              markerEnd: markerForArrow(true),
              data: { path: "step", startArrow: false, endArrow: true },
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
        </div>
      </SplitPane>
    </section>
  );
}
