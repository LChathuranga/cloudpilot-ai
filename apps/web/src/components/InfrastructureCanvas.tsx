import { useCallback, useMemo, useState } from "react";
import { addEdge, Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import { Cloud, Database, GitBranch, Plus, ShieldCheck } from "lucide-react";
import { validateInfrastructureGraph } from "../common/graph-core";
import type { NodeConfig } from "../workflow/workflow-types";

type ResourceKind = "vpc" | "subnet";
type ResourceData = { label: string; kind: ResourceKind; componentId: string; provider: "aws"; description: string; config: NodeConfig };
type ResourceNode = Node<ResourceData>;

const STORE_KEY = "cloudpilot-ai:infrastructure-draft:v1";
const catalog: { kind: ResourceKind; label: string; description: string; icon: string; componentId: string }[] = [
  { kind: "vpc", label: "AWS VPC", description: "Isolated virtual network", icon: "☁", componentId: "infrastructure.aws.vpc" },
  { kind: "subnet", label: "Subnet", description: "Network segment inside a VPC", icon: "▦", componentId: "infrastructure.aws.subnet" },
];

function defaults(kind: ResourceKind): NodeConfig {
  return kind === "vpc" ? { cidr: "10.0.0.0/16", region: "ap-southeast-1" } : { cidr: "10.0.1.0/24", public: false, availabilityZone: "ap-southeast-1a" };
}

function initialGraph(): { nodes: ResourceNode[]; edges: Edge[] } {
  try {
    const saved = window.localStorage.getItem(STORE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { nodes?: ResourceNode[]; edges?: Edge[] };
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return { nodes: parsed.nodes, edges: parsed.edges };
    }
  } catch { /* Ignore invalid local drafts and use the starter design. */ }
  return {
    nodes: [
      { id: "infra-vpc", type: "default", className: "infra-node infra-node-vpc", position: { x: 150, y: 90 }, data: { label: "Main VPC", kind: "vpc", componentId: "infrastructure.aws.vpc", provider: "aws", description: "AWS virtual private cloud", config: defaults("vpc") } },
      { id: "infra-subnet-public", type: "default", className: "infra-node infra-node-subnet", position: { x: 100, y: 290 }, data: { label: "Public subnet", kind: "subnet", componentId: "infrastructure.aws.subnet", provider: "aws", description: "Design-only subnet resource", config: { ...defaults("subnet"), cidr: "10.0.1.0/24", public: true } } },
      { id: "infra-subnet-private", type: "default", className: "infra-node infra-node-subnet", position: { x: 380, y: 290 }, data: { label: "Private subnet", kind: "subnet", componentId: "infrastructure.aws.subnet", provider: "aws", description: "Design-only subnet resource", config: { ...defaults("subnet"), cidr: "10.0.2.0/24", public: false } } },
    ],
    edges: [
      { id: "infra-contains-public", source: "infra-vpc", target: "infra-subnet-public", label: "contains", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#8a96b3", strokeWidth: 2 } },
      { id: "infra-contains-private", source: "infra-vpc", target: "infra-subnet-private", label: "contains", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#8a96b3", strokeWidth: 2 } },
    ],
  };
}

type Props = { onNotice: (message: string) => void };

export default function InfrastructureCanvas({ onNotice }: Props) {
  const initial = useMemo(initialGraph, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<ResourceNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const validation = useMemo(() => validateInfrastructureGraph({
    id: "infrastructure-main",
    name: "Cloud infrastructure design",
    version: 1,
    schemaVersion: "1.0",
    resources: nodes.map((node) => ({ id: node.id, componentId: node.data.componentId, label: node.data.label, provider: node.data.provider, config: node.data.config, tags: {} })),
    relationships: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, relationship: "contains" as const })),
  }), [nodes, edges]);

  const persist = useCallback((nextNodes: ResourceNode[], nextEdges: Edge[]) => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ nodes: nextNodes, edges: nextEdges }));
      onNotice("Infrastructure draft saved locally. No cloud resources were created.");
    } catch {
      onNotice("Could not save the infrastructure draft in browser storage.");
    }
  }, [onNotice]);

  const addResource = (kind: ResourceKind) => {
    const definition = catalog.find((item) => item.kind === kind);
    if (!definition) return;
    const id = `infra-${kind}-${Date.now()}`;
    const node: ResourceNode = {
      id, type: "default", className: `infra-node infra-node-${kind}`,
      position: { x: 170 + (nodes.length % 3) * 100, y: 100 + Math.floor(nodes.length / 3) * 120 },
      data: { label: `${definition.label} ${nodes.filter((item) => item.data.kind === kind).length + 1}`, kind, componentId: definition.componentId, provider: "aws", description: definition.description, config: defaults(kind) },
    };
    setNodes((current) => [...current, node]);
    setSelectedId(id);
    onNotice(`Added ${definition.label} to the infrastructure draft.`);
  };

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      onNotice("Choose two different resources to create a relationship.");
      return;
    }
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (source?.data.kind !== "vpc" || target?.data.kind !== "subnet") {
      onNotice("For this MVP, connect a VPC to a subnet to represent the contains relationship.");
      return;
    }
    if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
      onNotice("That resource relationship already exists.");
      return;
    }
    setEdges((current) => addEdge({ ...connection, id: `infra-edge-${Date.now()}`, label: "contains", type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#8a96b3", strokeWidth: 2 } }, current));
    onNotice("Infrastructure relationship added.");
  }, [edges, nodes, onNotice, setEdges]);

  function updateSelected(changes: Partial<ResourceData>) {
    if (!selected) return;
    setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, ...changes } } : node));
  }

  function updateConfig(key: string, value: string | boolean) {
    if (!selected) return;
    updateSelected({ config: { ...selected.data.config, [key]: value } });
  }

  function removeSelected() {
    if (!selected) return;
    if (!window.confirm(`Delete resource "${selected.data.label}" and its relationships from this draft?`)) return;
    setNodes((current) => current.filter((node) => node.id !== selected.id));
    setEdges((current) => current.filter((edge) => edge.source !== selected.id && edge.target !== selected.id));
    setSelectedId(null);
    onNotice("Resource removed from the design draft.");
  }

  return (
    <div className="infra-workspace">
      <aside className="infra-catalog">
        <div className="infra-catalog-heading"><span>RESOURCE CATALOG</span><small>AWS · DESIGN MODE</small></div>
        <div className="infra-category"><Cloud size={15} /> Networking</div>
        {catalog.map((item) => <button key={item.kind} className="infra-catalog-item" onClick={() => addResource(item.kind)}><span className={`infra-catalog-icon ${item.kind}`}>{item.icon}</span><span><b>{item.label}</b><small>{item.description}</small></span><Plus size={14} /></button>)}
        <div className="infra-category disabled"><Database size={15} /> Compute &amp; data <small>Planned</small></div>
        <div className="infra-category disabled"><ShieldCheck size={15} /> Identity &amp; security <small>Planned</small></div>
        <div className="infra-catalog-note"><ShieldCheck size={15} /><span><b>Design only</b><small>Editing this canvas never creates or modifies cloud resources.</small></span></div>
      </aside>
      <section className="infra-center">
        <div className="infra-toolbar"><div><div className="eyebrow">INFRASTRUCTURE DESIGN <span>•</span> AWS</div><h2>Cloud network</h2><p>Resource relationships are separate from workflow execution order.</p></div>
          <div className="infra-toolbar-actions"><span className="infra-provider-pill"><Cloud size={13} /> AWS · ap-southeast-1</span><button className="button button-secondary button-compact" onClick={() => persist(nodes, edges)}>Save draft</button><button className="button button-primary button-compact" onClick={() => onNotice(validation.valid ? "Infrastructure schema validation passed. IaC generation is planned; nothing was deployed." : validation.issues[0]?.message ?? "Fix the infrastructure validation issues.")}>Validate design</button></div>
        </div>
        <div className="infra-canvas-hint"><GitBranch size={14} /> Drag resources from the catalog. Connect a VPC output to a subnet input to model containment.</div>
        <div className="infra-canvas">
          <ReactFlow<ResourceNode, Edge> nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)} nodesConnectable fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={1.5}>
            <Background gap={20} size={1} color="#dfe5ee" /><Controls position="bottom-left" /><MiniMap position="bottom-right" pannable zoomable />
          </ReactFlow>
          {selected && <aside className="infra-inspector">
            <button className="inspector-close" onClick={() => setSelectedId(null)} aria-label="Close properties">×</button>
            <div className="eyebrow">RESOURCE PROPERTIES</div><h3>{selected.data.label}</h3><p>{selected.data.description}</p>
            <label htmlFor="infra-label">Resource name</label><input id="infra-label" value={selected.data.label} onChange={(event) => updateSelected({ label: event.target.value })} />
            {selected.data.kind === "vpc" ? <>
              <label htmlFor="infra-cidr">IPv4 CIDR</label><input id="infra-cidr" value={String(selected.data.config.cidr ?? "")} onChange={(event) => updateConfig("cidr", event.target.value)} />
              <label htmlFor="infra-region">AWS region</label><select id="infra-region" value={String(selected.data.config.region ?? "ap-southeast-1")} onChange={(event) => updateConfig("region", event.target.value)}><option value="ap-southeast-1">Singapore (ap-southeast-1)</option><option value="ap-south-1">Mumbai (ap-south-1)</option><option value="us-east-1">N. Virginia (us-east-1)</option><option value="eu-west-1">Ireland (eu-west-1)</option></select>
            </> : <>
              <label htmlFor="infra-subnet-cidr">Subnet CIDR</label><input id="infra-subnet-cidr" value={String(selected.data.config.cidr ?? "")} onChange={(event) => updateConfig("cidr", event.target.value)} />
              <label htmlFor="infra-az">Availability zone</label><input id="infra-az" value={String(selected.data.config.availabilityZone ?? "")} onChange={(event) => updateConfig("availabilityZone", event.target.value)} />
              <label className="infra-checkbox"><input type="checkbox" checked={Boolean(selected.data.config.public)} onChange={(event) => updateConfig("public", event.target.checked)} /> Public subnet</label>
            </>}
            <div className="infra-resource-id">ID · {selected.id}</div><button className="button button-danger delete-node-button" onClick={removeSelected}>Delete resource</button>
          </aside>}
        </div>
        <div className="infra-validation-panel"><div><b>Validation</b><span className={validation.valid ? "success-count" : "issue-count"}>{validation.valid ? "Schema valid" : `${validation.issues.length} issues`}</span></div>{validation.issues.length ? validation.issues.map((issue) => <p key={issue.code + issue.path}>{issue.message}</p>) : <p>Component schemas and resource relationships passed the current checks. CIDR overlap and provider planning checks are not yet implemented.</p>}</div>
      </section>
    </div>
  );
}
