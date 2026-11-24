import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ConnectionLineType,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Cloud,
  FileUp,
  GitBranch,
  Play,
  ShieldCheck,
  Trash2,
  Workflow,
  X,
  CircleHelp,
  Redo2,
  Undo2,
} from "lucide-react";
import { MAX_NODE_LABEL_LENGTH, MAX_WORKFLOW_NAME_LENGTH, checkNewConnection, findWorkflowIssues, isWorkflowNodeType, type WorkflowNodeType } from "./workflow/schema";
import { NODE_SPACING_X, WORKFLOW_NODE_TYPE, catalogEntry, defaultNodeConfig, edgeDefaults, nodeAccent, nodeCatalog, nodeSettings, suggestNodesFromScript, toWorkflowGraph, type WorkflowCanvasNode, type WorkflowNodeData } from "./workflow/editor";
import { NodeIssuesContext, nodeTypes } from "./workflow/WorkflowNode";
import { loadSavedWorkflows, storeSavedWorkflows, type SavedWorkflow, type SavedWorkflowVersion, type WorkflowSnapshot } from "./workflow/storage";


const initialNodes: Node<WorkflowNodeData>[] = [
  { id: "trigger", type: WORKFLOW_NODE_TYPE, position: { x: 0 * NODE_SPACING_X, y: 0 }, data: { label: "Start", kind: "trigger", description: "Workflow entry point", config: defaultNodeConfig("trigger") } },
  { id: "source", type: WORKFLOW_NODE_TYPE, position: { x: 1 * NODE_SPACING_X, y: 0 }, data: { label: "Checkout source", kind: "source", description: "Prepare source code", config: defaultNodeConfig("source") } },
  { id: "build", type: WORKFLOW_NODE_TYPE, position: { x: 2 * NODE_SPACING_X, y: 0 }, data: { label: "Build application", kind: "build", description: "Build the project artifact", config: defaultNodeConfig("build") } },
  { id: "test", type: WORKFLOW_NODE_TYPE, position: { x: 3 * NODE_SPACING_X, y: 0 }, data: { label: "Run tests", kind: "test", description: "Run the configured test suite", config: defaultNodeConfig("test") } },
  { id: "approval", type: WORKFLOW_NODE_TYPE, position: { x: 4 * NODE_SPACING_X, y: 0 }, data: { label: "Manual approval", kind: "approval", description: "Human review before deployment", config: defaultNodeConfig("approval") } },
  { id: "deploy", type: WORKFLOW_NODE_TYPE, position: { x: 5 * NODE_SPACING_X, y: 0 }, data: { label: "Deploy (mock)", kind: "deploy", description: "Simulate deployment; no cloud changes", config: defaultNodeConfig("deploy") } },
];

const initialEdges: Edge[] = [
  { id: "e-trigger-source", source: "trigger", target: "source", ...edgeDefaults },
  { id: "e-source-build", source: "source", target: "build", ...edgeDefaults },
  { id: "e-build-test", source: "build", target: "test", ...edgeDefaults },
  { id: "e-test-approval", source: "test", target: "approval", ...edgeDefaults },
  { id: "e-approval-deploy", source: "approval", target: "deploy", ...edgeDefaults },
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [prompt, setPrompt] = useState("");
  const [workflowId, setWorkflowId] = useState(() => `workflow-${Date.now()}`);
  const [workflowName, setWorkflowName] = useState("My deployment workflow");
  const [workflowVersion, setWorkflowVersion] = useState(1);
  const [initialLoad] = useState(loadSavedWorkflows);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>(initialLoad.workflows);
  const [selectedSavedVersion, setSelectedSavedVersion] = useState("");
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStack = useRef<WorkflowSnapshot[]>([]);
  const redoStack = useRef<WorkflowSnapshot[]>([]);
  const lastSnapshot = useRef<WorkflowSnapshot>({ nodes: initialNodes, edges: initialEdges });
  const skipHistoryCapture = useRef(false);
  const [notice, setNotice] = useState(() => {
    if (initialLoad.unreadable) return "Saved workflows in this browser could not be read and were ignored. Saving again will replace them.";
    if (initialLoad.skippedVersions > 0) return `Skipped ${initialLoad.skippedVersions} saved workflow version(s) that were damaged or from an older format.`;
    return "Ready to design. This prototype only simulates workflow execution.";
  });
  const [isRunning, setIsRunning] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<Node<WorkflowNodeData>, Edge> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);


  useEffect(() => {
    const currentSnapshot: WorkflowSnapshot = { nodes, edges };
    const currentKey = JSON.stringify(currentSnapshot);
    const previousKey = JSON.stringify(lastSnapshot.current);

    if (currentKey === previousKey) {
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

  const graphIssues = useMemo(
    () => findWorkflowIssues(toWorkflowGraph({ id: workflowId, name: workflowName, version: workflowVersion }, nodes, edges)),
    [nodes, edges, workflowId, workflowName, workflowVersion],
  );
  const graphErrors = useMemo(() => [...new Set(graphIssues.map((issue) => issue.message))], [graphIssues]);
  const issuesByNode = useMemo(() => {
    const byNode = new Map<string, string[]>();
    for (const issue of graphIssues) {
      if (issue.nodeId) byNode.set(issue.nodeId, [...(byNode.get(issue.nodeId) ?? []), issue.message]);
    }
    return byNode;
  }, [graphIssues]);

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
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;
    const limitProblem = checkNewConnection(
      { type: sourceNode.data.kind, outgoing: edges.filter((edge) => edge.source === sourceNode.id).length },
      { type: targetNode.data.kind, incoming: edges.filter((edge) => edge.target === targetNode.id).length },
    );
    if (limitProblem) {
      setNotice(limitProblem);
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
    setEdges((current) => addEdge({ ...connection, ...edgeDefaults }, current));
    setNotice("Connection added.");
  }, [nodes, edges, setEdges]);

  function createNode(kind: WorkflowNodeType, position?: { x: number; y: number }) {
    const definition = catalogEntry(kind);
    const id = `node-${kind}-${Date.now()}`;
    setNodes((current) => [...current, {
      id,
      type: WORKFLOW_NODE_TYPE,
      position: position ?? { x: (current.length % 4) * NODE_SPACING_X, y: 170 + Math.floor(current.length / 4) * 130 },
      data: {
        label: definition.label,
        kind: definition.kind,
        config: defaultNodeConfig(definition.kind),
        description: definition.kind === "deploy"
          ? "Simulate deployment; no cloud changes"
          : definition.description,
      },
    }]);
    setNotice(`Added ${definition.label}. Connect it to the workflow and configure it.`);
  }

  function handleCatalogDragStart(event: DragEvent<HTMLButtonElement>, kind: WorkflowNodeType) {
    event.dataTransfer.setData("application/cloudpilot-node", kind);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleCanvasDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/cloudpilot-node");
    if (!isWorkflowNodeType(kind) || !reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createNode(kind, position);
  }

  function deleteConnection(edgeId: string) {
    const target = edges.find((edge) => edge.id === edgeId);
    if (!target) return;
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
    const allowed = /\.(bat|cmd|ps1|yml|yaml|sh)$/i.test(file.name);
    if (!allowed) {
      setNotice("Unsupported file type. Choose a .bat, .cmd, .ps1, .sh, .yml, or .yaml file.");
      return;
    }
    if (file.size > 256_000) {
      setNotice("File is too large. The prototype accepts files up to 256 KB.");
      return;
    }

    const suggestions = suggestNodesFromScript(await file.text());

    if (suggestions.length === 0) {
      setNotice("No recognizable build, test, security, deployment, or health-check commands were found. Nothing was executed.");
      return;
    }

    const importBatchId = `import-batch-${Date.now()}`;
    const importY = nodes.reduce((lowest, node) => Math.max(lowest, node.position.y), 0) + 170;
    const importedNodes: Node<WorkflowNodeData>[] = suggestions.map((item, index) => ({
      id: `${importBatchId}-${index}`,
      type: WORKFLOW_NODE_TYPE,
      position: { x: index * NODE_SPACING_X, y: importY },
      data: {
        label: catalogEntry(item.kind).label,
        kind: item.kind,
        config: item.config,
        description: `Suggested from: ${item.line.slice(0, 100)}`,
        importBatchId,
      },
    }));
    const importedEdges: Edge[] = importedNodes.slice(1).map((node, index) => ({
      id: `${importBatchId}-edge-${index}`,
      source: importedNodes[index].id,
      target: node.id,
      ...edgeDefaults,
    }));
    setNodes((current) => [...current, ...importedNodes]);
    setEdges((current) => [...current, ...importedEdges]);
    window.setTimeout(() => void reactFlowInstance?.fitView({ padding: 0.12, maxZoom: 1, duration: 300 }), 50);
    setNotice(`Analyzed ${file.name}: suggested ${suggestions.length} nodes. The file was read as text only; it was not executed. Settings were pre-filled from the matching lines. The suggested chain is not connected yet: review every suggestion, then connect it into your workflow.`);
  }

  function persistSavedWorkflows(next: SavedWorkflow[]) {
    if (storeSavedWorkflows(next)) {
      setSavedWorkflows(next);
      return true;
    }
    setNotice("Could not save this workflow in browser storage. Check available storage space or browser privacy settings.");
    return false;
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
    skipHistoryCapture.current = true;
    undoStack.current = [];
    redoStack.current = [];
    const restoredNodes = snapshot.nodes.map((node) => ({ ...node, position: { ...node.position }, data: { ...node.data, config: { ...node.data.config } } }));
    const restoredEdges = snapshot.edges.map((edge) => ({ ...edge }));
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
      <header className="topbar">
        <a className="brand" href="#" aria-label="CloudPilot home">
          <span className="brand-mark"><Cloud size={20} /></span>
          <span>cloudpilot<span className="brand-ai">.ai</span></span>
        </a>
        <div className="topbar-center"><span className="status-dot" /> Local workspace <span className="topbar-divider">/</span> {workflowName} <span className="topbar-divider">/</span> v{workflowVersion}</div>
        <div className="topbar-actions"><span className="safe-pill"><ShieldCheck size={14} /> Safe mode</span><button className="button button-primary" onClick={runMock} disabled={isRunning || graphErrors.length > 0} title={graphErrors.length ? "Fix validation issues before running" : "Validate workflow graph (mock only)"}><Play size={15} /> {isRunning ? "Running…" : "Run mock"}</button></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">WORKSPACE</div>
          <button className="nav-item active"><Workflow size={17} /> Workflow editor</button>
          <button className="nav-item" onClick={() => fileInput.current?.click()}><FileUp size={17} /> Import deployment file</button>
          <input ref={fileInput} type="file" accept=".bat,.cmd,.ps1,.sh,.yml,.yaml" hidden onChange={(event) => { void importScript(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <div className="sidebar-label node-label">NODE CATALOG</div>
          {nodeCatalog.map((item) => <button key={item.kind} type="button" className="catalog-item" draggable onDragStart={(event) => handleCatalogDragStart(event, item.kind)} onClick={() => createNode(item.kind)} title={`Drag ${item.label} onto the canvas, or click to add it`}><span className={`catalog-icon ${item.iconClass}`}>{item.icon}</span><span><b>{item.label}</b><small>{item.description}</small></span></button>)}
          <div className="sidebar-bottom"><ShieldCheck size={16} /><span><b>Safety first</b><small>Imported scripts are never executed.</small></span></div>
        </aside>

        <section className="main-panel">
          <div className="page-heading">
            <div><div className="eyebrow">WORKFLOW DESIGNER <span>•</span> MVP PREVIEW</div><h1>Build your deployment flow</h1><p>Describe it, shape it visually, then validate before running.</p><div className="workflow-name-control"><label htmlFor="workflow-name">Workflow name</label><input id="workflow-name" maxLength={MAX_WORKFLOW_NAME_LENGTH} value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /></div></div>
          </div>

          <form className="prompt-panel" onSubmit={(event) => { event.preventDefault(); applyPrompt(); }}>
            <div className="prompt-icon"><Bot size={19} /></div>
            <div className="prompt-input-wrap"><label htmlFor="workflow-prompt">Tell CloudPilot what you want to deploy</label><input id="workflow-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Build my Node app, run tests, scan it, then deploy…" /><small>AI generation is planned next. No AI-generated commands are executed.</small></div>
            <button className="button button-primary prompt-submit" type="submit">Draft flow <ArrowRight size={15} /></button>
          </form>

          <div className="canvas-toolbar">
            <div className="canvas-title">
              <GitBranch size={16} />
              <b>Deployment pipeline</b>
              <span className="version-pill">v{workflowVersion}</span>
              <span className="canvas-meta">{nodes.length} nodes · {edges.length} connections</span>
              <button type="button" className="canvas-help" aria-label="How to edit the canvas" data-tip="Connect: drag from a node's right dot to another node's left dot. Remove: select a node or line, then press Delete."><CircleHelp size={15} /></button>
            </div>
            <div className="canvas-toolbar-actions">
              {selectedEdgeId && edges.some((edge) => edge.id === selectedEdgeId) && <button type="button" className="button button-danger button-compact" onClick={() => deleteConnection(selectedEdgeId)}><Trash2 size={13} /> Delete connection</button>}
              {nodes.some((node) => node.data.importBatchId) && <button type="button" className="button button-secondary button-compact" onClick={removeImportedNodes}><Trash2 size={13} /> Remove suggested</button>}
              <div className="toolbar-group">
                <button type="button" className="button button-secondary button-icon" onClick={undoWorkflowChange} disabled={!canUndo} title="Undo" aria-label="Undo"><Undo2 size={15} /></button>
                <button type="button" className="button button-secondary button-icon" onClick={redoWorkflowChange} disabled={!canRedo} title="Redo" aria-label="Redo"><Redo2 size={15} /></button>
              </div>
              <div className="toolbar-group">
                <select className="saved-version-select" aria-label="Saved workflow versions" value={selectedSavedVersion} onChange={(event) => setSelectedSavedVersion(event.target.value)}><option value="">Saved versions…</option>{savedWorkflows.flatMap((workflow) => workflow.versions.map((version) => ({ key: `${workflow.id}:${version.version}`, label: `${workflow.name} · v${version.version} · ${new Date(version.savedAt).toLocaleString()}` }))).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
                <button type="button" className="button button-secondary button-compact" onClick={openSavedWorkflow} disabled={!selectedSavedVersion}>Open</button>
              </div>
              <div className="toolbar-group">
                <button type="button" className="button button-secondary button-compact" onClick={startNewWorkflow}>New</button>
                {nodes.length > 0 && <button type="button" className="button button-secondary button-compact" onClick={clearWorkflow}><X size={13} /> Clear</button>}
              </div>
              <button type="button" className="button button-primary button-compact" onClick={saveWorkflow}>Save workflow</button>
            </div>
          </div>
          <div className="flow-canvas" onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}>
            <NodeIssuesContext.Provider value={issuesByNode}>
            <ReactFlow<Node<WorkflowNodeData>, Edge> onInit={setReactFlowInstance} nodeTypes={nodeTypes} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} connectionLineType={ConnectionLineType.SmoothStep} connectionLineStyle={{ stroke: "#6978ed", strokeWidth: 2.5 }} defaultEdgeOptions={edgeDefaults} onNodeClick={(_, node) => { setSelectedNode(node as Node<WorkflowNodeData>); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNode(null); }} onPaneClick={() => { setSelectedNode(null); setSelectedEdgeId(null); }} deleteKeyCode={["Backspace", "Delete"]} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.2} maxZoom={1.5}>
              <Background gap={20} size={1} color="#dfe5ee" />
              <Controls position="bottom-left" />
              <MiniMap<WorkflowCanvasNode> position="bottom-right" pannable zoomable style={{ width: 150, height: 96 }} nodeColor={(node) => nodeAccent[node.data.kind]} nodeStrokeWidth={0} nodeBorderRadius={8} maskColor="rgba(232, 236, 246, 0.6)" />
            </ReactFlow>
            </NodeIssuesContext.Provider>
            {selectedNode && <div className="node-inspector"><button className="inspector-close" onClick={() => setSelectedNode(null)} aria-label="Close node inspector"><X size={15} /></button><div className="eyebrow">NODE SETTINGS</div><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.description}</p><label htmlFor="node-label">Display name</label><input id="node-label" maxLength={MAX_NODE_LABEL_LENGTH} value={selectedNode.data.label} onChange={(event) => { const label = event.target.value; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, label } } : current); }} /><div className="settings-divider" /><div className="settings-section-title">NODE CONFIGURATION</div>{nodeSettings[selectedNode.data.kind].map((field) => <div className="setting-field" key={field.key}><label htmlFor={`setting-${selectedNode.id}-${field.key}`}>{field.label}</label><small>{field.description}</small>{field.input === "checkbox" ? <label className="setting-checkbox"><input id={`setting-${selectedNode.id}-${field.key}`} type="checkbox" checked={Boolean(selectedNode.data.config[field.key])} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.checked }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }} /> Enabled</label> : field.input === "select" ? <select id={`setting-${selectedNode.id}-${field.key}`} value={String(selectedNode.data.config[field.key] ?? "")} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.value }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.input === "textarea" ? <textarea id={`setting-${selectedNode.id}-${field.key}`} rows={3} value={String(selectedNode.data.config[field.key] ?? "")} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.value }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }} /> : <input id={`setting-${selectedNode.id}-${field.key}`} value={String(selectedNode.data.config[field.key] ?? "")} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.value }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }} />}</div>)}<button className="button button-danger delete-node-button" onClick={() => deleteNode(selectedNode.id)}><Trash2 size={14} /> Delete node</button></div>}
          </div>

          <div className="bottom-panels">
            <section className="status-panel"><div className="panel-heading"><Activity size={16} /><b>Activity & validation</b><span className={graphErrors.length ? "issue-count" : "success-count"}>{graphErrors.length ? `${graphErrors.length} issues` : "No issues"}</span></div><p className="status-message"><CheckCircle2 size={15} /> {notice}</p>{graphErrors.map((error) => <p className="validation-error" key={error}>{error}</p>)}</section>
            <section className="run-panel"><div className="panel-heading"><Play size={15} /><b>Execution</b><span className="mock-pill">MOCK ONLY</span></div><p>{graphErrors.length ? "Fix the validation issues before Run mock becomes available. Saving drafts is still allowed." : "Workflow passed validation. Run mock checks the graph only; it does not run shell commands or provision infrastructure."} Saved versions stay in this browser on this device.</p></section>
          </div>
          <footer className="footer-note">CloudPilot AI <span>•</span> Early MVP prototype <span>•</span> Real deployment is disabled</footer>
        </section>
      </section>
    </main>
  );
}
