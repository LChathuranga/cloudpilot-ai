import type { Edge } from "@xyflow/react";
import type { WorkflowNodeType } from "./schema";
import { defaultNodeConfig, kindIcon, inferNodeType } from "./node-config";
import type { WorkflowNode } from "./workflow-types";

export type ImportedGraph = { nodes: WorkflowNode[]; edges: Edge[] };

export function analyzeDeploymentScript(source: string): ImportedGraph {
  const suggestions = source.split(/\r?\n/)
    .map((line) => ({ line: line.trim(), kind: inferNodeType(line) }))
    .filter((item): item is { line: string; kind: WorkflowNodeType } => item.kind !== null)
    .slice(0, 12);

  const importBatchId = `import-batch-${Date.now()}`;
  const nodes: WorkflowNode[] = suggestions.map((item, index) => ({
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
  const edges: Edge[] = nodes.slice(1).map((node, index) => ({
    id: `${importBatchId}-edge-${index}`,
    source: nodes[index].id,
    target: node.id,
    animated: true,
  }));

  return { nodes, edges };
}
