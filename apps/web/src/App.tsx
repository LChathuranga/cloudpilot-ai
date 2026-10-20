import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
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
  Plus,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { validateWorkflowGraph, type WorkflowNodeType } from "./workflow/schema";

type WorkflowNodeData = {
  label: string;
  kind: WorkflowNodeType;
  description: string;
};

const initialNodes: Node<WorkflowNodeData>[] = [
  { id: "trigger", type: "input", position: { x: 60, y: 150 }, data: { label: "Start", kind: "trigger", description: "Workflow entry point" } },
  { id: "source", position: { x: 290, y: 150 }, data: { label: "Checkout source", kind: "source", description: "Prepare source code" } },
  { id: "build", position: { x: 520, y: 150 }, data: { label: "Build application", kind: "build", description: "Build the project artifact" } },
  { id: "test", position: { x: 750, y: 150 }, data: { label: "Run tests", kind: "test", description: "Run the configured test suite" } },
  { id: "approval", position: { x: 980, y: 150 }, data: { label: "Manual approval", kind: "approval", description: "Human review before deployment" } },
  { id: "deploy", type: "output", position: { x: 1210, y: 150 }, data: { label: "Deploy (mock)", kind: "deploy", description: "Simulate deployment; no cloud changes" } },
];

const initialEdges: Edge[] = [
  { id: "e-trigger-source", source: "trigger", target: "source", animated: true },
  { id: "e-source-build", source: "source", target: "build", animated: true },
  { id: "e-build-test", source: "build", target: "test", animated: true },
  { id: "e-test-approval", source: "test", target: "approval", animated: true },
  { id: "e-approval-deploy", source: "approval", target: "deploy", animated: true },
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
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [notice, setNotice] = useState("Ready to design. This prototype only simulates workflow execution.");
  const [isRunning, setIsRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const graphErrors = useMemo(() => validateWorkflowGraph({
    id: "cloudpilot-workflow",
    name: "My deployment workflow",
    version: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      label: node.data.label,
      config: {},
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  }), [nodes, edges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true }, current));
  }, [setEdges]);

  function createNode() {
    const id = `approval-${Date.now()}`;
    setNodes((current) => [...current, {
      id,
      position: { x: 420, y: 330 + current.length * 24 },
      data: { label: "Review step", kind: "approval" as WorkflowNodeType, description: "Configure this workflow step" },
    }]);
    setNotice("Added a review node. Connect it to the workflow and configure it.");
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

    const importedNodes: Node<WorkflowNodeData>[] = suggestions.map((item, index) => ({
      id: `import-${Date.now()}-${index}`,
      position: { x: 80 + index * 230, y: 330 },
      data: {
        label: `${kindIcon[item.kind]} ${item.kind.replace("-", " ")}`,
        kind: item.kind,
        description: `Suggested from: ${item.line.slice(0, 100)}`,
      },
    }));
    const importedEdges: Edge[] = importedNodes.slice(1).map((node, index) => ({
      id: `import-edge-${Date.now()}-${index}`,
      source: importedNodes[index].id,
      target: node.id,
      animated: true,
    }));
    setNodes((current) => [...current, ...importedNodes]);
    setEdges((current) => [...current, ...importedEdges]);
    setNotice(`Analyzed ${file.name}: suggested ${suggestions.length} nodes. The file was read as text only; it was not executed. Review every suggestion before use.`);
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
        <div className="topbar-center"><span className="status-dot" /> Local workspace <span className="topbar-divider">/</span> Untitled workflow</div>
        <div className="topbar-actions"><span className="safe-pill"><ShieldCheck size={14} /> Safe mode</span><button className="button button-primary" onClick={runMock} disabled={isRunning}><Play size={15} /> {isRunning ? "Running…" : "Run mock"}</button></div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">WORKSPACE</div>
          <button className="nav-item active"><Workflow size={17} /> Workflow editor</button>
          <button className="nav-item" onClick={() => fileInput.current?.click()}><FileUp size={17} /> Import deployment file</button>
          <input ref={fileInput} type="file" accept=".bat,.cmd,.ps1,.sh,.yml,.yaml" hidden onChange={(event) => { void importScript(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <div className="sidebar-label node-label">NODE CATALOG <button className="icon-button" onClick={createNode} title="Add a review node"><Plus size={14} /></button></div>
          <div className="catalog-item"><span className="catalog-icon trigger-icon">◉</span><span><b>Trigger</b><small>Start workflow</small></span></div>
          <div className="catalog-item"><span className="catalog-icon source-icon">⑂</span><span><b>Source</b><small>Checkout repository</small></span></div>
          <div className="catalog-item"><span className="catalog-icon build-icon">▣</span><span><b>Build</b><small>Build application</small></span></div>
          <div className="catalog-item"><span className="catalog-icon test-icon">✓</span><span><b>Test</b><small>Run test suite</small></span></div>
          <div className="catalog-item"><span className="catalog-icon scan-icon"><ShieldCheck size={15} /></span><span><b>Security scan</b><small>Check known risks</small></span></div>
          <div className="catalog-item"><span className="catalog-icon approval-icon">◎</span><span><b>Approval</b><small>Human checkpoint</small></span></div>
          <div className="catalog-item"><span className="catalog-icon deploy-icon"><Cloud size={15} /></span><span><b>Deploy</b><small>Mock deployment</small></span></div>
          <div className="sidebar-bottom"><ShieldCheck size={16} /><span><b>Safety first</b><small>Imported scripts are never executed.</small></span></div>
        </aside>

        <section className="main-panel">
          <div className="page-heading">
            <div><div className="eyebrow">WORKFLOW DESIGNER <span>•</span> MVP PREVIEW</div><h1>Build your deployment flow</h1><p>Describe it, shape it visually, then validate before running.</p></div>
            <button className="button button-secondary" onClick={createNode}><Plus size={15} /> Add node</button>
          </div>

          <form className="prompt-panel" onSubmit={(event) => { event.preventDefault(); applyPrompt(); }}>
            <div className="prompt-icon"><Bot size={19} /></div>
            <div className="prompt-input-wrap"><label htmlFor="workflow-prompt">Tell CloudPilot what you want to deploy</label><input id="workflow-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Build my Node app, run tests, scan it, then deploy…" /><small>AI generation is planned next. No AI-generated commands are executed.</small></div>
            <button className="button button-primary prompt-submit" type="submit">Draft flow <ArrowRight size={15} /></button>
          </form>

          <div className="canvas-toolbar"><div className="canvas-title"><GitBranch size={16} /><b>Deployment pipeline</b><span className="version-pill">v1</span></div><div className="canvas-meta">{nodes.length} nodes <span>·</span> {edges.length} connections</div></div>
          <div className="flow-canvas">
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedNode(node as Node<WorkflowNodeData>)} onPaneClick={() => setSelectedNode(null)} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.2} maxZoom={1.5}>
              <Background gap={20} size={1} color="#dfe5ee" />
              <Controls position="bottom-left" />
              <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={3} />
            </ReactFlow>
            {selectedNode && <div className="node-inspector"><button className="inspector-close" onClick={() => setSelectedNode(null)} aria-label="Close node inspector"><X size={15} /></button><div className="eyebrow">NODE SETTINGS</div><h3>{selectedNode.data.label}</h3><p>{selectedNode.data.description}</p><label htmlFor="node-label">Display name</label><input id="node-label" value={selectedNode.data.label} onChange={(event) => { const label = event.target.value; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, label } } : node)); setSelectedNode((current) => current ? { ...current, data: { ...current.data, label } } : current); }} /></div>}
          </div>

          <div className="bottom-panels">
            <section className="status-panel"><div className="panel-heading"><Activity size={16} /><b>Activity & validation</b><span className={graphErrors.length ? "issue-count" : "success-count"}>{graphErrors.length ? `${graphErrors.length} issues` : "No issues"}</span></div>{graphErrors.length ? graphErrors.map((error) => <p className="validation-error" key={error}>{error}</p>) : <p className="status-message"><CheckCircle2 size={15} /> {notice}</p>}</section>
            <section className="run-panel"><div className="panel-heading"><Play size={15} /><b>Execution</b><span className="mock-pill">MOCK ONLY</span></div><p>No cloud provider is connected. Run mock validates the graph only; it does not run shell commands or provision infrastructure.</p></section>
          </div>
          <footer className="footer-note">CloudPilot AI <span>•</span> Early MVP prototype <span>•</span> Real deployment is disabled</footer>
        </section>
      </section>
    </main>
  );
}
