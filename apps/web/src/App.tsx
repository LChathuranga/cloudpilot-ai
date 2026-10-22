import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ConnectionLineType,
  MarkerType,
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
} from "lucide-react";
import { validateWorkflowGraph, type WorkflowNodeType } from "./workflow/schema";

type WorkflowSnapshot = { nodes: Node<WorkflowNodeData>[]; edges: Edge[] };
type SavedWorkflowVersion = WorkflowSnapshot & { workflowId: string; name: string; version: number; savedAt: string };
type SavedWorkflow = { id: string; name: string; versions: SavedWorkflowVersion[] };
const SAVED_WORKFLOWS_KEY = "cloudpilot-ai:saved-workflows:v1";

type NodeConfig = Record<string, string | boolean>;

type WorkflowNodeData = {
  label: string;
  config: NodeConfig;
  kind: WorkflowNodeType;
  description: string;
  importBatchId?: string;
};


type SettingField = {
  key: string;
  label: string;
  description: string;
  input?: "text" | "textarea" | "select" | "checkbox";
  options?: { label: string; value: string }[];
};

const nodeSettings: Record<WorkflowNodeType, SettingField[]> = {
  trigger: [
    { key: "event", label: "Trigger event", description: "What starts this workflow?", input: "select", options: [{ label: "Manual", value: "manual" }, { label: "Push to branch", value: "push" }, { label: "Pull request", value: "pull_request" }, { label: "Schedule", value: "schedule" }] },
    { key: "branch", label: "Branch", description: "Branch to watch", input: "text" },
  ],
  source: [
    { key: "repository", label: "Repository URL", description: "Git repository to check out", input: "text" },
    { key: "branch", label: "Branch", description: "Branch or ref to use", input: "text" },
  ],
  build: [
    { key: "command", label: "Build command", description: "Command to build the artifact", input: "textarea" },
    { key: "workingDirectory", label: "Working directory", description: "Directory relative to the project root", input: "text" },
    { key: "artifactPath", label: "Artifact path", description: "Optional output path", input: "text" },
  ],
  test: [
    { key: "command", label: "Test command", description: "Command to run the test suite", input: "textarea" },
    { key: "workingDirectory", label: "Working directory", description: "Directory relative to the project root", input: "text" },
    { key: "continueOnFailure", label: "Continue if tests fail", description: "Allow later steps to continue after a test failure", input: "checkbox" },
  ],
  "security-scan": [
    { key: "scanner", label: "Scanner", description: "Security scanner to use", input: "select", options: [{ label: "Trivy", value: "trivy" }, { label: "npm audit", value: "npm-audit" }, { label: "Snyk", value: "snyk" }, { label: "SonarQube", value: "sonarqube" }] },
    { key: "severityThreshold", label: "Fail at severity", description: "Minimum finding severity that should fail the step", input: "select", options: [{ label: "Low", value: "low" }, { label: "Medium", value: "medium" }, { label: "High", value: "high" }, { label: "Critical", value: "critical" }] },
  ],
  approval: [
    { key: "required", label: "Require approval", description: "Pause for a human decision", input: "checkbox" },
    { key: "approver", label: "Approver or team", description: "Who should review this step?", input: "text" },
  ],
  deploy: [
    { key: "provider", label: "Cloud provider", description: "Target provider", input: "select", options: [{ label: "AWS", value: "aws" }, { label: "Google Cloud", value: "gcp" }, { label: "Azure", value: "azure" }, { label: "Local / mock", value: "mock" }] },
    { key: "environment", label: "Environment", description: "Deployment environment", input: "select", options: [{ label: "Development", value: "development" }, { label: "Staging", value: "staging" }, { label: "Production", value: "production" }] },
    { key: "target", label: "Deployment target", description: "Service, cluster, or app name", input: "text" },
    { key: "region", label: "Region", description: "Cloud region (if applicable)", input: "text" },
  ],
  "health-check": [
    { key: "url", label: "Health-check URL", description: "Endpoint to check", input: "text" },
    { key: "expectedStatus", label: "Expected HTTP status", description: "Expected response code", input: "text" },
    { key: "timeoutSeconds", label: "Timeout (seconds)", description: "Maximum time to wait", input: "text" },
  ],
  rollback: [
    { key: "strategy", label: "Rollback strategy", description: "How to recover", input: "select", options: [{ label: "Previous revision", value: "previous-revision" }, { label: "Blue/green switch", value: "blue-green" }, { label: "Manual recovery", value: "manual" }] },
    { key: "target", label: "Target service", description: "Service to recover", input: "text" },
  ],
};

function defaultNodeConfig(kind: WorkflowNodeType): NodeConfig {
  const defaults: Record<WorkflowNodeType, NodeConfig> = {
    trigger: { event: "manual", branch: "main" },
    source: { repository: "", branch: "main" },
    build: { command: "npm ci && npm run build", workingDirectory: ".", artifactPath: "dist/" },
    test: { command: "npm test", workingDirectory: ".", continueOnFailure: false },
    "security-scan": { scanner: "trivy", severityThreshold: "high" },
    approval: { required: true, approver: "" },
    deploy: { provider: "mock", environment: "staging", target: "", region: "" },
    "health-check": { url: "", expectedStatus: "200", timeoutSeconds: "30" },
    rollback: { strategy: "previous-revision", target: "" },
  };
  return { ...defaults[kind] };
}

const initialNodes: Node<WorkflowNodeData>[] = [
  { id: "trigger", className: "workflow-node workflow-node-trigger", position: { x: 60, y: 150 }, data: { label: "Start", kind: "trigger", description: "Workflow entry point", config: defaultNodeConfig("trigger") } },
  { id: "source", className: "workflow-node workflow-node-source", position: { x: 290, y: 150 }, data: { label: "Checkout source", kind: "source", description: "Prepare source code", config: defaultNodeConfig("source") } },
  { id: "build", className: "workflow-node workflow-node-build", position: { x: 520, y: 150 }, data: { label: "Build application", kind: "build", description: "Build the project artifact", config: defaultNodeConfig("build") } },
  { id: "test", className: "workflow-node workflow-node-test", position: { x: 750, y: 150 }, data: { label: "Run tests", kind: "test", description: "Run the configured test suite", config: defaultNodeConfig("test") } },
  { id: "approval", className: "workflow-node workflow-node-approval", position: { x: 980, y: 150 }, data: { label: "Manual approval", kind: "approval", description: "Human review before deployment", config: defaultNodeConfig("approval") } },
  { id: "deploy", className: "workflow-node workflow-node-deploy", position: { x: 1210, y: 150 }, data: { label: "Deploy (mock)", kind: "deploy", description: "Simulate deployment; no cloud changes", config: defaultNodeConfig("deploy") } },
];

const initialEdges: Edge[] = [
  { id: "e-trigger-source", source: "trigger", target: "source", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-source-build", source: "source", target: "build", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-build-test", source: "build", target: "test", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-test-approval", source: "test", target: "approval", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-approval-deploy", source: "approval", target: "deploy", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
];

const kindIcon: Record<WorkflowNodeType, string> = {
  trigger: "◉",
  source: "⑂",
  build: "▣",
  test: "✓",
  "security-scan": "⌁",
  approval: "◎",
  deploy: "⇧",
  "health-check": "♥",
  rollback: "↶",
};

const nodeCatalog: { kind: WorkflowNodeType; label: string; description: string; icon: string; iconClass: string }[] = [
  { kind: "trigger", label: "Trigger", description: "Start workflow", icon: "◉", iconClass: "trigger-icon" },
  { kind: "source", label: "Source", description: "Checkout repository", icon: "⑂", iconClass: "source-icon" },
  { kind: "build", label: "Build", description: "Build application", icon: "▣", iconClass: "build-icon" },
  { kind: "test", label: "Test", description: "Run test suite", icon: "✓", iconClass: "test-icon" },
  { kind: "security-scan", label: "Security scan", description: "Check known risks", icon: "⌁", iconClass: "scan-icon" },
  { kind: "approval", label: "Approval", description: "Human checkpoint", icon: "◎", iconClass: "approval-icon" },
  { kind: "deploy", label: "Deploy", description: "Mock deployment", icon: "⇧", iconClass: "deploy-icon" },
  { kind: "health-check", label: "Health check", description: "Verify service health", icon: "♥", iconClass: "test-icon" },
  { kind: "rollback", label: "Rollback", description: "Recovery step", icon: "↶", iconClass: "approval-icon" },
];

function inferNodeType(line: string): WorkflowNodeType | null {
  const command = line.trim().toLowerCase();
  if (!command || command.startsWith("rem ") || command.startsWith("::")) return null;
  if (/^(echo|@echo|set |cd |pushd |call )/.test(command)) return null;
  if (/(npm|pnpm|yarn|pip|dotnet|mvn|gradle).*(build|install|publish)/.test(command)) return "build";
  if (/(test|pytest|jest|vitest|playwright|cypress)/.test(command)) return "test";
  if (/(docker build|docker push|docker login)/.test(command)) return "build";
  if (/(aws|az |gcloud|kubectl|helm|terraform|pulumi|deploy)/.test(command)) return "deploy";
  if (/(trivy|snyk|sonar|security|npm audit)/.test(command)) return "security-scan";
  if (/(curl|wget|health|healthcheck)/.test(command)) return "health-check";
  return null;
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
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
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStack = useRef<WorkflowSnapshot[]>([]);
  const redoStack = useRef<WorkflowSnapshot[]>([]);
  const lastSnapshot = useRef<WorkflowSnapshot>({ nodes: initialNodes, edges: initialEdges });
  const skipHistoryCapture = useRef(false);
  const [notice, setNotice] = useState("Ready to design. This prototype only simulates workflow execution.");
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

  const graphErrors = useMemo(() => validateWorkflowGraph({
    id: workflowId,
    name: workflowName,
    version: workflowVersion,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      label: node.data.label,
      config: node.data.config,
    })),
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
    setEdges((current) => addEdge({ ...connection, type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } }, current));
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
    const kind = event.dataTransfer.getData("application/cloudpilot-node") as WorkflowNodeType;
    if (!nodeCatalog.some((item) => item.kind === kind) || !reactFlowInstance) return;
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

    const source = await file.text();
    const lines = source.split(/\r?\n/);
    const suggestions = lines
      .map((line) => ({ line: line.trim(), kind: inferNodeType(line) }))
      .filter((item): item is { line: string; kind: WorkflowNodeType } => item.kind !== null)
      .slice(0, 12);

    if (suggestions.length === 0) {
      setNotice("No recognizable build, test, security, deployment, or health-check commands were found. Nothing was executed.");
      return;
    }

    const importBatchId = `import-batch-${Date.now()}`;
    const importedNodes: Node<WorkflowNodeData>[] = suggestions.map((item, index) => ({
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
      id: `${importBatchId}-edge-${index}`,
      source: importedNodes[index].id,
      target: node.id,
      animated: true,
    }));
    setNodes((current) => [...current, ...importedNodes]);
    setEdges((current) => [...current, ...importedEdges]);
    setNotice(`Analyzed ${file.name}: suggested ${suggestions.length} nodes. The file was read as text only; it was not executed. Review every suggestion before use.`);
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
            <div><div className="eyebrow">WORKFLOW DESIGNER <span>•</span> MVP PREVIEW</div><h1>Build your deployment flow</h1><p>Describe it, shape it visually, then validate before running.</p><div className="workflow-name-control"><label htmlFor="workflow-name">Workflow name</label><input id="workflow-name" maxLength={120} value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /></div></div>
          </div>

          <form className="prompt-panel" onSubmit={(event) => { event.preventDefault(); applyPrompt(); }}>
            <div className="prompt-icon"><Bot size={19} /></div>
            <div className="prompt-input-wrap"><label htmlFor="workflow-prompt">Tell CloudPilot what you want to deploy</label><input id="workflow-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Build my Node app, run tests, scan it, then deploy…" /><small>AI generation is planned next. No AI-generated commands are executed.</small></div>
            <button className="button button-primary prompt-submit" type="submit">Draft flow <ArrowRight size={15} /></button>
          </form>

          <div className="canvas-toolbar"><div className="canvas-title"><GitBranch size={16} /><b>Deployment pipeline</b><span className="version-pill">v{workflowVersion}</span><span className="connect-hint">Connect: drag between dots · Remove: click a line, then press Delete or use the button</span></div><div className="canvas-toolbar-actions"><button type="button" className="button button-primary button-compact" onClick={saveWorkflow}>Save workflow</button><select className="saved-version-select" aria-label="Saved workflow versions" value={selectedSavedVersion} onChange={(event) => setSelectedSavedVersion(event.target.value)}><option value="">Open saved version…</option>{savedWorkflows.flatMap((workflow) => workflow.versions.map((version) => ({ key: `${workflow.id}:${version.version}`, label: `${workflow.name} · v${version.version} · ${new Date(version.savedAt).toLocaleString()}` }))).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><button type="button" className="button button-secondary button-compact" onClick={openSavedWorkflow} disabled={!selectedSavedVersion}>Open</button><button type="button" className="button button-secondary button-compact" onClick={startNewWorkflow}>New</button><button type="button" className="button button-secondary button-compact" onClick={undoWorkflowChange} disabled={!canUndo} title="Undo the last workflow change">Undo</button><button type="button" className="button button-secondary button-compact" onClick={redoWorkflowChange} disabled={!canRedo} title="Redo the last undone change">Redo</button>{selectedEdgeId && edges.some((edge) => edge.id === selectedEdgeId) && <button className="button button-danger button-compact" onClick={() => deleteConnection(selectedEdgeId)}><Trash2 size={13} /> Delete connection</button>}{nodes.some((node) => node.data.importBatchId) && <button className="button button-secondary button-compact" onClick={removeImportedNodes}><Trash2 size={13} /> Remove imported nodes</button>}{nodes.length > 0 && <button className="button button-secondary button-compact" onClick={clearWorkflow}><X size={13} /> Clear workflow</button>}<span className="canvas-meta">{nodes.length} nodes <span>·</span> {edges.length} connections</span></div></div>
          <div className="flow-canvas" onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}>
            <ReactFlow<Node<WorkflowNodeData>, Edge> onInit={setReactFlowInstance} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodesConnectable={true} connectionLineType={ConnectionLineType.SmoothStep} connectionLineStyle={{ stroke: "#6978ed", strokeWidth: 2.5 }} defaultEdgeOptions={{ type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" }, style: { stroke: "#8793d8", strokeWidth: 2 } }} onNodeClick={(_, node) => { setSelectedNode(node as Node<WorkflowNodeData>); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNode(null); }} onPaneClick={() => { setSelectedNode(null); setSelectedEdgeId(null); }} deleteKeyCode={["Backspace", "Delete"]} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.2} maxZoom={1.5}>
              <Background gap={20} size={1} color="#dfe5ee" />
              <Controls position="bottom-left" />
              <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={3} />
            </ReactFlow>
            {selectedNode && <div className="node-inspector"><button className="inspector-close" onClick={() => setSelectedNode(null)} aria-label="Close node inspector"><X size={15} /></button><div className="eyebrow">NODE SETTINGS</div><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.description}</p><label htmlFor="node-label">Display name</label><input id="node-label" value={selectedNode.data.label} onChange={(event) => { const label = event.target.value; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, label } } : current); }} /><div className="settings-divider" /><div className="settings-section-title">NODE CONFIGURATION</div>{nodeSettings[selectedNode.data.kind].map((field) => <div className="setting-field" key={field.key}><label htmlFor={`setting-${selectedNode.id}-${field.key}`}>{field.label}</label><small>{field.description}</small>{field.input === "checkbox" ? <label className="setting-checkbox"><input id={`setting-${selectedNode.id}-${field.key}`} type="checkbox" checked={Boolean(selectedNode.data.config[field.key])} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.checked }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }} /> Enabled</label> : field.input === "select" ? <select id={`setting-${selectedNode.id}-${field.key}`} value={String(selectedNode.data.config[field.key] ?? "")} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.value }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.input === "textarea" ? <textarea id={`setting-${selectedNode.id}-${field.key}`} rows={3} value={String(selectedNode.data.config[field.key] ?? "")} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.value }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }} /> : <input id={`setting-${selectedNode.id}-${field.key}`} value={String(selectedNode.data.config[field.key] ?? "")} onChange={(event) => { const config = { ...selectedNode.data.config, [field.key]: event.target.value }; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, config } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, config } } : current); }} />}</div>)}<button className="button button-danger delete-node-button" onClick={() => deleteNode(selectedNode.id)}><Trash2 size={14} /> Delete node</button></div>}
          </div>

          <div className="bottom-panels">
            <section className="status-panel"><div className="panel-heading"><Activity size={16} /><b>Activity & validation</b><span className={graphErrors.length ? "issue-count" : "success-count"}>{graphErrors.length ? `${graphErrors.length} issues` : "No issues"}</span></div>{graphErrors.length ? graphErrors.map((error) => <p className="validation-error" key={error}>{error}</p>) : <p className="status-message"><CheckCircle2 size={15} /> {notice}</p>}</section>
            <section className="run-panel"><div className="panel-heading"><Play size={15} /><b>Execution</b><span className="mock-pill">MOCK ONLY</span></div><p>{graphErrors.length ? "Fix the validation issues before Run mock becomes available. Saving drafts is still allowed." : "Workflow passed validation. Run mock checks the graph only; it does not run shell commands or provision infrastructure."} Saved versions stay in this browser on this device.</p></section>
          </div>
          <footer className="footer-note">CloudPilot AI <span>•</span> Early MVP prototype <span>•</span> Real deployment is disabled</footer>
        </section>
      </section>
    </main>
  );
}
