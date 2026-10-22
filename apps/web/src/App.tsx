import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge, MarkerType, useEdgesState, useNodesState,
  type Connection, type Edge, type ReactFlowInstance,
} from "@xyflow/react";
import { validateWorkflowGraph, type WorkflowNodeType } from "./workflow/schema";
import { defaultNodeConfig, initialEdges, initialNodes, inferNodeType, kindIcon, nodeCatalog, SAVED_WORKFLOWS_KEY } from "./workflow/node-config";
import type { SavedWorkflow, SavedWorkflowVersion, WorkflowNode, WorkflowNodeData, WorkflowSnapshot } from "./workflow/workflow-types";
import AppHeader from "./components/AppHeader";
import ActivityPanels from "./components/ActivityPanels";
import WorkflowCanvas from "./components/WorkflowCanvas";
import WorkflowPrompt from "./components/WorkflowPrompt";
import WorkflowToolbar from "./components/WorkflowToolbar";
import WorkspaceSidebar from "./components/WorkspaceSidebar";

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [prompt, setPrompt] = useState("");
  const [workflowId, setWorkflowId] = useState(() => `workflow-${Date.now()}`);
  const [workflowName, setWorkflowName] = useState("My deployment workflow");
  const [workflowVersion, setWorkflowVersion] = useState(1);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>(() => {
    try {
      const stored = window.localStorage.getItem(SAVED_WORKFLOWS_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed as SavedWorkflow[] : [];
    } catch {
      return [];
    }
  });
  const [selectedSavedVersion, setSelectedSavedVersion] = useState("");
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStack = useRef<WorkflowSnapshot[]>([]);
  const redoStack = useRef<WorkflowSnapshot[]>([]);
  const lastSnapshot = useRef<WorkflowSnapshot>({ nodes: initialNodes, edges: initialEdges });
  const skipHistoryCapture = useRef(false);
  const [notice, setNotice] = useState("Ready to design. This prototype only simulates workflow execution.");
  const [isRunning, setIsRunning] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<WorkflowNode, Edge> | null>(null);

  useEffect(() => {
    const currentSnapshot: WorkflowSnapshot = { nodes, edges };
    if (JSON.stringify(currentSnapshot) === JSON.stringify(lastSnapshot.current)) {
      if (skipHistoryCapture.current) skipHistoryCapture.current = false;
      return;
    }

    if (skipHistoryCapture.current) {
      skipHistoryCapture.current = false;
      lastSnapshot.current = currentSnapshot;
      setCanUndo(undoStack.current.length > 0);
      setCanRedo(redoStack.current.length > 0);
      return;
    }

    undoStack.current.push(lastSnapshot.current);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    lastSnapshot.current = currentSnapshot;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(false);
  }, [nodes, edges]);

  const graphErrors = useMemo(() => validateWorkflowGraph({
    id: workflowId,
    name: workflowName,
    version: workflowVersion,
    nodes: nodes.map((node) => ({ id: node.id, type: node.data.kind, label: node.data.label, config: node.data.config })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  }), [nodes, edges, workflowId, workflowName, workflowVersion]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) {
      setNotice("A connection must have both a source and a target node.");
      return;
    }
    if (connection.source === connection.target) {
      setNotice("A node cannot connect to itself.");
      return;
    }
    if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
      setNotice("That connection already exists.");
      return;
    }

    const adjacency = new Map<string, string[]>();
    for (const edge of edges) adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    const stack = [connection.target];
    const visited = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      if (current === connection.source) {
        setNotice("That connection would create a cycle. Cycles are not supported in this MVP.");
        return;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(adjacency.get(current) ?? []));
    }
    setEdges((current) => addEdge({
      ...connection,
      type: "smoothstep",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" },
    }, current));
    setNotice("Connection added.");
  }, [edges, setEdges]);

  function createNode(kind: WorkflowNodeType, position?: { x: number; y: number }) {
    const definition = nodeCatalog.find((item) => item.kind === kind);
    if (!definition) return;
    const id = `node-${kind}-${Date.now()}`;
    setNodes((current) => [...current, {
      id,
      className: `workflow-node workflow-node-${kind}`,
      position: position ?? { x: 260 + (current.length % 3) * 190, y: 300 + Math.floor(current.length / 3) * 90 },
      data: {
        label: definition.label,
        kind: definition.kind,
        config: defaultNodeConfig(definition.kind),
        description: definition.kind === "deploy" ? "Simulate deployment; no cloud changes" : definition.description,
      },
    }]);
    setNotice(`Added ${definition.label}. Connect it to the workflow and configure it.`);
  }

  function handleCanvasDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleCanvasDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/cloudpilot-node") as WorkflowNodeType;
    if (!nodeCatalog.some((item) => item.kind === kind) || !reactFlowInstance) return;
    createNode(kind, reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function deleteConnection(edgeId: string) {
    if (!edges.some((edge) => edge.id === edgeId)) return;
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId(null);
    setNotice("Connection removed. Other nodes and connections were left unchanged.");
  }

  function deleteNode(nodeId: string) {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target) return;
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode((current) => current?.id === nodeId ? null : current);
    setSelectedEdgeId(null);
    setNotice(`Deleted "${target.data.label}" and its connected edges. Review the remaining graph before running.`);
  }

  function updateNode(nodeId: string, changes: Partial<WorkflowNodeData>) {
    setNodes((current) => current.map((node) => node.id === nodeId
      ? { ...node, data: { ...node.data, ...changes } }
      : node));
    setSelectedNode((current) => current?.id === nodeId
      ? { ...current, data: { ...current.data, ...changes } }
      : current);
  }

  function removeImportedNodes() {
    const importedIds = new Set(nodes.filter((node) => node.data.importBatchId).map((node) => node.id));
    if (importedIds.size === 0) return;
    if (!window.confirm(`Remove all ${importedIds.size} nodes imported from deployment files? The original files will not be deleted.`)) return;
    setNodes((current) => current.filter((node) => !node.data.importBatchId));
    setEdges((current) => current.filter((edge) => !importedIds.has(edge.source) && !importedIds.has(edge.target)));
    setSelectedNode((current) => current && importedIds.has(current.id) ? null : current);
    setNotice(`Removed ${importedIds.size} imported nodes and their connections. Original uploaded files were not changed.`);
  }

  function clearWorkflow() {
    if (!window.confirm("Clear the entire workflow canvas? This removes all nodes and connections from the current unsaved graph.")) return;
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setNotice("Workflow cleared. Add nodes or import a deployment file to start again.");
  }

  function applyPrompt() {
    if (!prompt.trim()) {
      setNotice("Describe the workflow you want first.");
      return;
    }
    setNotice("AI workflow generation is the next milestone. For now, edit the sample graph or import a script for safe analysis.");
  }

  async function importScript(file?: File) {
    if (!file) return;
    if (!/\.(bat|cmd|ps1|yml|yaml|sh)$/i.test(file.name)) {
      setNotice("Unsupported file type. Choose a .bat, .cmd, .ps1, .sh, .yml, or .yaml file.");
      return;
    }
    if (file.size > 256_000) {
      setNotice("File is too large. The prototype accepts files up to 256 KB.");
      return;
    }

    const source = await file.text();
    const suggestions = source.split(/\r?\n/)
      .map((line) => ({ line: line.trim(), kind: inferNodeType(line) }))
      .filter((item): item is { line: string; kind: WorkflowNodeType } => item.kind !== null)
      .slice(0, 12);

    if (suggestions.length === 0) {
      setNotice("No recognizable build, test, security, deployment, or health-check commands were found. Nothing was executed.");
      return;
    }

    const importBatchId = `import-batch-${Date.now()}`;
    const importedNodes: WorkflowNode[] = suggestions.map((item, index) => ({
      id: `${importBatchId}-${index}`,
      className: `workflow-node workflow-node-${item.kind}`,
      position: { x: 80 + index * 230, y: 330 },
      data: {
        label: `${kindIcon[item.kind]} ${item.kind.replace("-", " ")}`,
        kind: item.kind,
        config: defaultNodeConfig(item.kind),
        description: `Suggested from: ${item.line.slice(0, 100)}`,
        importBatchId,
      },
    }));
    const importedEdges: Edge[] = importedNodes.slice(1).map((node, index) => ({
      id: `${importBatchId}-edge-${index}`, source: importedNodes[index].id, target: node.id, animated: true,
    }));
    setNodes((current) => [...current, ...importedNodes]);
    setEdges((current) => [...current, ...importedEdges]);
    setNotice(`Analyzed ${file.name}: suggested ${suggestions.length} nodes. The file was read as text only; it was not executed. Review every suggestion before use.`);
  }

  function undoWorkflowChange() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push({ nodes, edges });
    skipHistoryCapture.current = true;
    lastSnapshot.current = previous;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    setNotice("Undid the last workflow change.");
  }

  function redoWorkflowChange() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ nodes, edges });
    skipHistoryCapture.current = true;
    lastSnapshot.current = next;
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    setNotice("Redid the workflow change.");
  }

  function persistSavedWorkflows(next: SavedWorkflow[]) {
    try {
      window.localStorage.setItem(SAVED_WORKFLOWS_KEY, JSON.stringify(next));
      setSavedWorkflows(next);
      return true;
    } catch {
      setNotice("Could not save this workflow in browser storage. Check available storage space or browser privacy settings.");
      return false;
    }
  }

  function saveWorkflow() {
    const existing = savedWorkflows.find((workflow) => workflow.id === workflowId);
    const nextVersion = (existing?.versions.reduce((max, item) => Math.max(max, item.version), 0) ?? 0) + 1;
    const snapshot: SavedWorkflowVersion = {
      workflowId,
      name: workflowName.trim() || "Untitled workflow",
      version: nextVersion,
      savedAt: new Date().toISOString(),
      nodes: nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } })),
      edges: edges.map((edge) => ({ ...edge })),
    };
    const next: SavedWorkflow[] = existing
      ? savedWorkflows.map((workflow) => workflow.id === workflowId
        ? { ...workflow, name: snapshot.name, versions: [...workflow.versions, snapshot] }
        : workflow)
      : [...savedWorkflows, { id: workflowId, name: snapshot.name, versions: [snapshot] }];
    if (!persistSavedWorkflows(next)) return;
    setWorkflowName(snapshot.name);
    setWorkflowVersion(nextVersion);
    setSelectedSavedVersion(`${workflowId}:${nextVersion}`);
    setNotice(`Saved "${snapshot.name}" as version ${nextVersion}. This is a local browser save; no cloud commands were executed.`);
  }

  function openSavedWorkflow() {
    const [savedId, versionText] = selectedSavedVersion.split(":");
    const saved = savedWorkflows.find((workflow) => workflow.id === savedId);
    const snapshot = saved?.versions.find((item) => item.version === Number(versionText));
    if (!snapshot) {
      setNotice("Choose a saved workflow version to open.");
      return;
    }
    const restoredNodes = snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
    const restoredEdges = snapshot.edges.map((edge) => ({ ...edge }));
    skipHistoryCapture.current = true;
    undoStack.current = [];
    redoStack.current = [];
    lastSnapshot.current = { nodes: restoredNodes, edges: restoredEdges };
    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setWorkflowId(snapshot.workflowId);
    setWorkflowName(snapshot.name);
    setWorkflowVersion(snapshot.version);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setCanUndo(false);
    setCanRedo(false);
    setNotice(`Opened "${snapshot.name}" version ${snapshot.version}.`);
  }

  function startNewWorkflow() {
    if (!window.confirm("Start a new workflow? Save your current work first if you want to keep it.")) return;
    const nextNodes = initialNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
    const nextEdges = initialEdges.map((edge) => ({ ...edge }));
    skipHistoryCapture.current = true;
    undoStack.current = [];
    redoStack.current = [];
    lastSnapshot.current = { nodes: nextNodes, edges: nextEdges };
    setNodes(nextNodes);
    setEdges(nextEdges);
    setWorkflowId(`workflow-${Date.now()}`);
    setWorkflowName("My deployment workflow");
    setWorkflowVersion(1);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setCanUndo(false);
    setCanRedo(false);
    setNotice("Started a new workflow. Save it to keep a local version.");
  }

  function runMock() {
    if (graphErrors.length > 0) {
      setNotice(`Cannot simulate yet: ${graphErrors[0]}`);
      return;
    }
    setIsRunning(true);
    setNotice("Mock run complete: workflow graph passed basic validation. No commands were run and no cloud resources were changed.");
    window.setTimeout(() => setIsRunning(false), 500);
  }

  return (
    <main className="app-shell">
      <AppHeader workflowName={workflowName} workflowVersion={workflowVersion} isRunning={isRunning}
        hasValidationErrors={graphErrors.length > 0} onRun={runMock} />
      <section className="workspace">
        <WorkspaceSidebar onCreateNode={createNode} onImportScript={importScript} />
        <section className="main-panel">
          <div className="page-heading">
            <div>
              <div className="eyebrow">WORKFLOW DESIGNER <span>•</span> MVP PREVIEW</div>
              <h1>Build your deployment flow</h1>
              <p>Describe it, shape it visually, then validate before running.</p>
              <div className="workflow-name-control">
                <label htmlFor="workflow-name">Workflow name</label>
                <input id="workflow-name" maxLength={120} value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
              </div>
            </div>
          </div>
          <WorkflowPrompt prompt={prompt} onPromptChange={setPrompt} onSubmit={applyPrompt} />
          <WorkflowToolbar
            workflowVersion={workflowVersion} nodeCount={nodes.length} edgeCount={edges.length}
            savedWorkflows={savedWorkflows} selectedSavedVersion={selectedSavedVersion}
            onSelectedSavedVersionChange={setSelectedSavedVersion} onSave={saveWorkflow} onOpen={openSavedWorkflow}
            onNew={startNewWorkflow} onUndo={undoWorkflowChange} onRedo={redoWorkflowChange}
            canUndo={canUndo} canRedo={canRedo}
            selectedEdgeExists={Boolean(selectedEdgeId && edges.some((edge) => edge.id === selectedEdgeId))}
            onDeleteConnection={() => { if (selectedEdgeId) deleteConnection(selectedEdgeId); }}
            hasImportedNodes={nodes.some((node) => Boolean(node.data.importBatchId))}
            onRemoveImportedNodes={removeImportedNodes} hasNodes={nodes.length > 0} onClear={clearWorkflow}
          />
          <WorkflowCanvas
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onInit={setReactFlowInstance} onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}
            selectedNode={selectedNode} onSelectNode={setSelectedNode} onSelectEdge={setSelectedEdgeId}
            onDeleteNode={deleteNode} onUpdateNode={updateNode}
          />
          <ActivityPanels errors={graphErrors} notice={notice} />
          <footer className="footer-note">CloudPilot AI <span>•</span> Early MVP prototype <span>•</span> Real deployment is disabled</footer>
        </section>
      </section>
    </main>
  );
}
