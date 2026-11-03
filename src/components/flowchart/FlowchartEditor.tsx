import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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
import { LabeledNode, type LabeledFlowNode } from "./LabeledNode";

type FlowchartEditorProps = {
  project: ProjectRecord;
};

const nodeTypes = { labeled: LabeledNode };

function toDoc(
  id: string,
  name: string,
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
): FlowchartDocument {
  return {
    format: "gdd-studio-flowchart",
    version: 1,
    id,
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: "labeled",
      position: n.position,
      data: { label: String((n.data as { label?: string }).label ?? "Node") },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  };
}

export function FlowchartEditor({ project }: FlowchartEditorProps) {
  const flowchartId = "main";
  const [name, setName] = useState("Main");
  const [nodes, setNodes] = useNodesState<LabeledFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const rfRef = useRef<ReactFlowInstance<LabeledFlowNode, Edge> | null>(null);
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
        setDirty(false);
        setStatus(`Saved ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    },
    [project.id, name],
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

  // Keep attachHandlers' onChangeLabel using latest queueSave
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
        const loadedNodes: LabeledFlowNode[] = (doc.nodes ?? []).map((n) => ({
          id: n.id,
          type: "labeled",
          position: n.position,
          data: { label: n.data?.label ?? "Node" },
        }));
        idCounter.current =
          loadedNodes.reduce((max, n) => {
            const m = /^n-(\d+)$/.exec(n.id);
            return m ? Math.max(max, Number(m[1])) : max;
          }, 0) + 1;
        setNodes(
          loadedNodes.map((n) => ({
            ...n,
            data: {
              label: n.data.label,
              onChangeLabel: (nodeId: string, label: string) => {
                setNodes((prev) => {
                  const next = prev.map((node) =>
                    node.id === nodeId
                      ? { ...node, data: { ...node.data, label } }
                      : node,
                  );
                  queueSaveRef.current(next, edgesRef.current);
                  return next;
                });
              },
            },
          })),
        );
        setEdges(
          (doc.edges ?? []).map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
          })),
        );
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
    (changes: NodeChange<LabeledFlowNode>[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        const meaningful = changes.some(
          (c) =>
            c.type === "remove" ||
            c.type === "add" ||
            (c.type === "position" && c.dragging === false),
        );
        if (meaningful) queueSave(next, edgesRef.current);
        return next;
      });
    },
    [setNodes, queueSave],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
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
      setEdges((eds) => {
        const next = addEdge(
          {
            ...connection,
            id: `e-${connection.source}-${connection.target}-${Date.now()}`,
          },
          eds,
        );
        queueSave(nodesRef.current, next);
        return next;
      });
    },
    [setEdges, queueSave],
  );

  const addNode = () => {
    const id = `n-${idCounter.current++}`;
    const index = idCounter.current - 1;
    const origin =
      rfRef.current?.screenToFlowPosition({
        x: window.innerWidth / 2 - 80,
        y: window.innerHeight / 2 - 120,
      }) ?? { x: 80, y: 60 };
    const position = {
      x: origin.x + ((index - 1) % 3) * 200,
      y: origin.y + Math.floor((index - 1) / 3) * 140,
    };

    setNodes((nds) => {
      const next: LabeledFlowNode[] = [
        ...nds,
        {
          id,
          type: "labeled",
          position,
          data: {
            label: `Node ${idCounter.current - 1}`,
            onChangeLabel: (nodeId: string, label: string) => {
              setNodes((prev) => {
                const updated = prev.map((node) =>
                  node.id === nodeId
                    ? { ...node, data: { ...node.data, label } }
                    : node,
                );
                queueSaveRef.current(updated, edgesRef.current);
                return updated;
              });
            },
          },
        },
      ];
      queueSave(next, edgesRef.current);
      return next;
    });
  };

  const deleteSelected = () => {
    setNodes((nds) => {
      const next = nds.filter((n) => !n.selected);
      setEdges((eds) => {
        const nextEdges = eds.filter(
          (e) => !e.selected && e.id !== selectedEdgeId,
        );
        queueSave(next, nextEdges);
        return nextEdges;
      });
      return next;
    });
    setSelectedEdgeId(null);
  };

  const editEdgeLabel = () => {
    const edge = edges.find((e) => e.id === selectedEdgeId || e.selected);
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

  const renameSelectedNode = () => {
    const node = nodes.find((n) => n.selected) ?? nodes[0];
    if (!node) return;
    const nextLabel = window.prompt("Node label", node.data.label ?? "");
    if (nextLabel === null) return;
    const label = nextLabel.trim() || "Node";
    setNodes((prev) => {
      const next = prev.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, label } } : n,
      );
      queueSave(next, edgesRef.current);
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
          <button type="button" className="primary" onClick={addNode}>
            Add node
          </button>
          <button type="button" onClick={renameSelectedNode} disabled={nodes.length === 0}>
            Rename node
          </button>
          <button
            type="button"
            onClick={editEdgeLabel}
            disabled={!selectedEdgeId && !edges.some((e) => e.selected)}
          >
            Edge label
          </button>
          <button type="button" onClick={deleteSelected}>
            Delete selected
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              void persist(nodes, edges, viewportRef.current)
            }
          >
            Save now
          </button>
        </div>
      </header>
      <p className="muted tiny flowchart-hint">
        Drag to pan · scroll to zoom · drag handles to connect · double-click a
        node to rename. Autosaves into this project.
      </p>
      <div className="flowchart-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView={nodes.length > 0}
          defaultViewport={viewportRef.current}
          onInit={(instance) => {
            rfRef.current = instance;
          }}
          onMoveEnd={(_, vp) => {
            viewportRef.current = vp;
          }}
          onSelectionChange={({ edges: selEdges }) => {
            setSelectedEdgeId(selEdges[0]?.id ?? null);
          }}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} color="#4a4a4a" />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </section>
  );
}
