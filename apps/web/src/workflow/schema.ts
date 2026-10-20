import { z } from "zod";

export const workflowNodeTypes = [
  "trigger",
  "source",
  "build",
  "test",
  "security-scan",
  "approval",
  "deploy",
  "health-check",
  "rollback",
] as const;

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(workflowNodeTypes),
  label: z.string().min(1).max(100),
  config: z.record(z.unknown()).default({}),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

export const workflowGraphSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export function validateWorkflowGraph(graph: WorkflowGraph): string[] {
  const parsed = workflowGraphSchema.safeParse(graph);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => issue.message);
  }

  const ids = new Set(graph.nodes.map((node) => node.id));
  const errors: string[] = [];

  if (ids.size !== graph.nodes.length) {
    errors.push("Every node must have a unique ID.");
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.source)) errors.push(`Connection ${edge.id} has a missing source node.`);
    if (!ids.has(edge.target)) errors.push(`Connection ${edge.id} has a missing target node.`);
    if (edge.source === edge.target) errors.push(`Connection ${edge.id} cannot loop to the same node.`);
  }

  return [...new Set(errors)];
}
