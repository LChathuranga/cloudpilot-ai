import { useCallback, useMemo, useState } from "react";
import { GitBranch, Layers3 } from "lucide-react";
import {
  addEdge, MarkerType, useEdgesState, useNodesState,
  type Connection, type Edge, type ReactFlowInstance,
} from "@xyflow/react";
import { validateWorkflowGraph, type WorkflowNodeType } from "./workflow/schema";
import { defaultNodeConfig, initialEdges, initialNodes, nodeCatalog } from "./workflow/node-config";
import type { SavedWorkflow, WorkflowNode, WorkflowNodeData } from "./workflow/workflow-types";
import { useWorkflowHistory } from "./hooks/useWorkflowHistory";
import { analyzeDeploymentScript } from "./workflow/script-importer";
import { createSavedWorkflowVersion, loadSavedWorkflows, persistSavedWorkflows } from "./workflow/workflow-storage";
import AppHeader from "./components/AppHeader";
import ActivityPanels from "./components/ActivityPanels";
import WorkflowCanvas from "./components/WorkflowCanvas";
import WorkflowPrompt from "./components/WorkflowPrompt";
import WorkflowToolbar from "./components/WorkflowToolbar";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import WorkflowsDashboard from "./components/WorkflowsDashboard";
import InfrastructureCanvas from "./components/InfrastructureCanvas";
import type { SavedWorkflowVersion } from "./workflow/workflow-types";

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [view, setView] = useState<"dashboard" | "editor">("dashboard");
  const [activeCanvas, setActiveCanvas] = useState<"workflow" | "infrastructure">("workflow");
  const [prompt, setPrompt] = useState("");
  const [workflowId, setWorkflowId] = useState(() => `workflow-${Date.now()}`);
  const [workflowName, setWorkflowName] = useState("My deployment workflow");
  const [workflowVersion, setWorkflowVersion] = useState(1);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>(loadSavedWorkflows);
  const [selectedSavedVersion, setSelectedSavedVersion] = useState("");
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("Ready to design. This prototype only simulates workflow execution.");
  const [isRunning, setIsRunning] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<WorkflowNode, Edge> | null>(null);

  function openDashboardWorkflow(snapshot: SavedWorkflowVersion) {
    const restoredNodes = snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
    const restoredEdges = snapshot.edges.map((edge) => ({ ...edge }));
    history.resetTo({ nodes: restoredNodes, edges: restoredEdges });
    setWorkflowId(snapshot.workflowId);
    setWorkflowName(snapshot.name);
    setWorkflowVersion(snapshot.version);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setActiveCanvas("workflow");
    setView("editor");
    setNotice(`Opened "${snapshot.name}" version ${snapshot.version}.`);
  }

  function createWorkflow(mode: "blank" | "sample" | "ai") {
    const nextNodes = mode === "sample" ? initialNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } })) : [];
    const nextEdges = mode === "sample" ? initialEdges.map((edge) => ({ ...edge })) : [];
    history.resetTo({ nodes: nextNodes, edges: nextEdges });
    setWorkflowId(`workflow-${Date.now()}`);
    setWorkflowName(mode === "sample" ? "Sample deployment workflow" : mode === "ai" ? "AI workflow proposal" : "Untitled workflow");
    setWorkflowVersion(1);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setPrompt(mode === "ai" ? "Create a secure CI/CD pipeline for my application with build, tests, security scanning, approval and deployment." : "");
    setActiveCanvas("workflow");
    setView("editor");
    setNotice(mode === "ai"
      ? "AI proposal workspace opened. The AI planner backend is not connected yet, so no generated nodes are being claimed. You can edit the prompt and build a draft manually."
      : mode === "sample" ? "Sample pipeline loaded. Edit the nodes and settings, then save your own version." : "Blank workflow created. Add nodes from the catalog or import a deployment file.");
  }

  function duplicateDashboardWorkflow(snapshot: SavedWorkflowVersion) {
    const duplicateId = `workflow-${Date.now()}`;
    const duplicatedNodes = snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
    const duplicatedEdges = snapshot.edges.map((edge) => ({ ...edge }));
    history.resetTo({ nodes: duplicatedNodes, edges: duplicatedEdges });
    setWorkflowId(duplicateId);
    setWorkflowName(`${snapshot.name} copy`);
    setWorkflowVersion(1);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setActiveCanvas("workflow");
    setView("editor");
    setNotice("Workflow duplicated as a new unsaved draft. Save it to add it to your dashboard.");
  }

  function deleteDashboardWorkflow(workflowIdToDelete: string) {
    const next = savedWorkflows.filter((workflow) => workflow.id !== workflowIdToDelete);
    if (!persistSavedWorkflows(next)) {
      setNotice("Could not update browser storage. The saved workflow was not deleted.");
      return;
    }
    setSavedWorkflows(next);
  }

  const history = useWorkflowHistory(nodes, edges, setNodes, setEdges, setNotice);

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
    const importedGraph = analyzeDeploymentScript(source);
    if (importedGraph.nodes.length === 0) {
      setNotice("No recognizable build, test, security, deployment, or health-check commands were found. Nothing was executed.");
      return;
    }
    setNodes((current) => [...current, ...importedGraph.nodes]);
    setEdges((current) => [...current, ...importedGraph.edges]);
    setNotice(`Analyzed ${file.name}: suggested ${importedGraph.nodes.length} nodes. The file was read as text only; it was not executed. Review every suggestion before use.`);
  }

  function saveWorkflow() {
    const { workflows, snapshot } = createSavedWorkflowVersion({
      savedWorkflows,
      workflowId,
      workflowName,
      nodes,
      edges,
    });
    if (!persistSavedWorkflows(workflows)) {
      setNotice("Could not save this workflow in browser storage. Check available storage space or browser privacy settings.");
      return;
    }
    setSavedWorkflows(workflows);
    setWorkflowName(snapshot.name);
    setWorkflowVersion(snapshot.version);
    setSelectedSavedVersion(`${workflowId}:${snapshot.version}`);
    setNotice(`Saved "${snapshot.name}" as version ${snapshot.version}. This is a local browser save; no cloud commands were executed.`);
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
    history.resetTo({ nodes: restoredNodes, edges: restoredEdges });
    setWorkflowId(snapshot.workflowId);
    setWorkflowName(snapshot.name);
    setWorkflowVersion(snapshot.version);
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setNotice(`Opened "${snapshot.name}" version ${snapshot.version}.`);
  }

  function startNewWorkflow() {
    if (!window.confirm("Start a new workflow? Save your current work first if you want to keep it.")) return;
    const nextNodes = initialNodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
    const nextEdges = initialEdges.map((edge) => ({ ...edge }));
    history.resetTo({ nodes: nextNodes, edges: nextEdges });
    setWorkflowId(`workflow-${Date.now()}`);
    setWorkflowName("My deployment workflow");
    setWorkflowVersion(1);
    setSelectedNode(null);
    setSelectedEdgeId(null);
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

  if (view === "dashboard") {
    return <WorkflowsDashboard workflows={savedWorkflows} onCreate={createWorkflow} onOpen={openDashboardWorkflow} onDuplicate={duplicateDashboardWorkflow} onDelete={deleteDashboardWorkflow} onOpenInfrastructure={() => { setActiveCanvas("infrastructure"); setView("editor"); }} />;
  }

  return (
    <main className="app-shell">
      <AppHeader workflowName={workflowName} workflowVersion={workflowVersion} isRunning={isRunning}
        hasValidationErrors={activeCanvas !== "workflow" || graphErrors.length > 0} onRun={runMock} onBack={() => setView("dashboard")} />
      <section className={activeCanvas === "infrastructure" ? "workspace infrastructure-mode" : "workspace"}>
        {activeCanvas === "workflow" && <WorkspaceSidebar onCreateNode={createNode} onImportScript={importScript} />}
        <section className="main-panel">
          <div className="page-heading editor-page-heading">
            <div>
              <div className="eyebrow">CLOUDPILOT WORKSPACE <span>•</span> MVP PREVIEW</div>
              <h1>{activeCanvas === "workflow" ? "Build your deployment flow" : "Design your cloud infrastructure"}</h1>
              <p>{activeCanvas === "workflow" ? "Shape your CI/CD pipeline visually, configure every step, then validate." : "Model cloud resources and their relationships separately from workflow execution."}</p>
              {activeCanvas === "workflow" && <div className="workflow-name-control">
                <label htmlFor="workflow-name">Workflow name</label>
                <input id="workflow-name" maxLength={120} value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
              </div>}
            </div>
          </div>
          <nav className="canvas-mode-tabs" aria-label="Design canvas">
            <button type="button" className={activeCanvas === "workflow" ? "canvas-mode-tab active" : "canvas-mode-tab"} onClick={() => setActiveCanvas("workflow")}><GitBranch size={16} /><span><b>Workflows</b><small>CI/CD and automation</small></span></button>
            <button type="button" className={activeCanvas === "infrastructure" ? "canvas-mode-tab active" : "canvas-mode-tab"} onClick={() => setActiveCanvas("infrastructure")}><Layers3 size={16} /><span><b>Infrastructure</b><small>Cloud resource design</small></span><span className="design-only-tag">DESIGN ONLY</span></button>
          </nav>
          {activeCanvas === "workflow" ? <>
            <WorkflowPrompt prompt={prompt} onPromptChange={setPrompt} onSubmit={applyPrompt} />
            <WorkflowToolbar
              workflowVersion={workflowVersion} nodeCount={nodes.length} edgeCount={edges.length}
              savedWorkflows={savedWorkflows} selectedSavedVersion={selectedSavedVersion}
              onSelectedSavedVersionChange={setSelectedSavedVersion} onSave={saveWorkflow} onOpen={openSavedWorkflow}
              onNew={startNewWorkflow} onUndo={() => { history.undo(); setSelectedNode(null); setSelectedEdgeId(null); }} onRedo={() => { history.redo(); setSelectedNode(null); setSelectedEdgeId(null); }}
              canUndo={history.canUndo} canRedo={history.canRedo}
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
          </> : <InfrastructureCanvas onNotice={setNotice} />}
          <footer className="footer-note">CloudPilot AI <span>•</span> Early MVP prototype <span>•</span> Real deployment is disabled</footer>
        </section>
      </section>
    </main>
  );
}
