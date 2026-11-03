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
import { EdgeMarkers } from "./EdgeMarkers";
import { FlowNode } from "./FlowNode";
import { StubCurveEdge, StubStepEdge } from "./StubbedEdge";
import {
  COLOR_PALETTE,
  NODE_KIND_OPTIONS,
  SHAPE_OPTIONS,
  defaultSizeFor,
  edgeTypeForPath,
  kindDefaults,
  markerForEnd,
  migrateEdge,
  migrateNode,
  serializeEdge,
  serializeNode,
  type FlowEdge,
  type FlowEdgeEnd,
  type FlowEdgePath,
  type FlowNode as FlowNodeT,
  type FlowNodeKind,
  type FlowNodeShape,
} from "./flowModel";
import { deleteFlowchart } from "../../api";
import {
  emitFlowchartDeleted,
  emitFlowchartSaved,
} from "../../lib/flowchartEvents";

type FlowchartEditorProps = {
  project: ProjectRecord;
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

export function FlowchartEditor({ project }: FlowchartEditorProps) {
  const flowchartId = "main";
  const [name, setName] = useState("Main");
  const [nodes, setNodes] = useNodesState<FlowNodeT>([]);
  const [edges, setEdges] = useEdgesState<FlowEdge>([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<FlowNodeKind>("process");
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const rfRef = useRef<ReactFlowInstance<FlowNodeT, FlowEdge> | null>(null);
  const saveTimer = useRef<number | null>(null);
  const idCounter = useRef(1);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const persist = useCallback(
    async (nextNodes: Node[], nextEdges: Edge[], vp: Viewport) => {
      const doc = toDoc(flowchartId, name, nextNodes, nextEdges, vp);
      try {
        await saveFlowchart(project.id, flowchartId, doc);
        emitFlowchartSaved(project.id, flowchartId, doc);
        setDirty(false);
        setStatus(`Saved ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [project.id, name, flowchartId],
  );

  const queueSave = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) => {
      setDirty(true);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(nextNodes, nextEdges, viewportRef.current);
      }, 450);
    },
    [persist],
  );

  const queueSaveRef = useRef(queueSave);
  queueSaveRef.current = queueSave;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const doc = await loadFlowchart(project.id, flowchartId);
        if (cancelled) return;
        setName(doc.name || "Main");
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
  }, [project.id, setNodes, setEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeT>[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        const meaningful = changes.some(
          (c) =>
            c.type === "remove" ||
            c.type === "add" ||
            c.type === "dimensions" ||
            (c.type === "position" && c.dragging === false),
        );
        if (meaningful) queueSave(next, edgesRef.current);
        return next;
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
            type: edgeTypeForPath("curve"),
            markerEnd: markerForEnd("arrow"),
            data: { path: "curve", end: "arrow" },
          },
          eds,
        );
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

  const patchSelectedEdge = (path?: FlowEdgePath, end?: FlowEdgeEnd) => {
    const target = selectedEdge;
    if (!target) return;
    setEdges((eds) => {
      const next = eds.map((e) => {
        if (e.id !== target.id) return e;
        const nextPath = path ?? e.data?.path ?? "curve";
        const nextEnd = end ?? e.data?.end ?? "arrow";
        return {
          ...e,
          type: edgeTypeForPath(nextPath),
          markerEnd: markerForEnd(nextEnd),
          data: { path: nextPath, end: nextEnd },
        };
      });
      queueSave(nodesRef.current, next);
      return next;
    });
  };

  const addNode = (kind: FlowNodeKind = addKind) => {
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
          label: `${defaults.defaultLabel}${kind === "process" ? ` ${index}` : ""}`,
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

  if (!ready) {
    return (
      <section className="flowchart-shell">
        <p className="muted flowchart-status">{status}</p>
      </section>
    );
  }

  return (
    <section className="flowchart-shell" aria-label="Flowchart editor">
      <header className="flowchart-toolbar" role="toolbar">
        <div className="flowchart-toolbar-left">
          <strong>{name}</strong>
          <span className="muted tiny">{dirty ? "Unsaved…" : status}</span>
        </div>
        <div className="flowchart-toolbar-actions">
          <label className="tool-inline">
            <span className="muted tiny">Add</span>
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as FlowNodeKind)}
              aria-label="Node type to add"
            >
              {NODE_KIND_OPTIONS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={() => addNode()}>
            Add node
          </button>
          <button
            type="button"
            onClick={renameSelectedNode}
            disabled={!selectedNode && nodes.length === 0}
          >
            Rename
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
          <button
            type="button"
            className="danger-outline"
            title="Remove flowchart file (embeds become broken)"
            onClick={() => {
              if (
                !window.confirm(
                  `Delete flowchart “${flowchartId}”? Document embeds will show a broken state.`,
                )
              ) {
                return;
              }
              void deleteFlowchart(project.id, flowchartId).then(() => {
                emitFlowchartDeleted(project.id, flowchartId);
                setNodes([]);
                setEdges([]);
                setStatus("Flowchart deleted");
              });
            }}
          >
            Delete flowchart
          </button>
        </div>
      </header>

      <div className="flowchart-style-bar" aria-label="Style selected">
        <div className="style-group">
          <span className="muted tiny">Type</span>
          {NODE_KIND_OPTIONS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={
                selectedNode?.data.kind === k.kind ? "chip active" : "chip"
              }
              disabled={!selectedNode}
              onClick={() => {
                const shape = k.defaultShape;
                const size = defaultSizeFor(k.kind, shape);
                patchSelectedNode({
                  kind: k.kind,
                  shape,
                  fill: selectedNode?.data.fill ?? k.defaultFill,
                  width: size.width,
                  height: size.height,
                });
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
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
            onClick={() => patchSelectedEdge("curve")}
          >
            Curved
          </button>
          <button
            type="button"
            className={
              selectedEdge?.data?.path === "step" ? "chip active" : "chip"
            }
            disabled={!selectedEdge}
            onClick={() => patchSelectedEdge("step")}
          >
            Angled
          </button>
          {(["none", "arrow", "diamond", "circle"] as FlowEdgeEnd[]).map(
            (end) => (
              <button
                key={end}
                type="button"
                className={
                  selectedEdge?.data?.end === end ? "chip active" : "chip"
                }
                disabled={!selectedEdge}
                onClick={() => patchSelectedEdge(undefined, end)}
              >
                {end}
              </button>
            ),
          )}
        </div>
      </div>

      <p className="muted tiny flowchart-hint">
        Drag from a node’s N/E/S/W anchor dots to connect · edges stay locked to
        those handles when you move/resize · select a node for type/shape/color ·
        select an edge for curved/angled path. Autosaves into this project.
      </p>

      <div className="flowchart-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={28}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: "stubStep",
            markerEnd: markerForEnd("arrow"),
            data: { path: "step", end: "arrow" },
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
          <EdgeMarkers />
          <Background gap={18} size={1} color="#4a4a4a" />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </section>
  );
}
