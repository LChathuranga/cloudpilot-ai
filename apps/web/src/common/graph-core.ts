import { z } from "zod";
import { schemaVersionSchema, validateComponentConfig, validatePortConnection } from "./component-contract.js";
import { getComponentDefinition } from "./catalog.js";

export const stableIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
  message: "ID must be a stable, non-empty identifier using letters, numbers, '.', '_', ':', or '-'.",
});

export const resourceReferenceSchema = z.object({
  graphId: stableIdSchema,
  resourceId: stableIdSchema,
  revision: z.number().int().positive().optional(),
});

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
  id: stableIdSchema,
  type: z.enum(workflowNodeTypes),
  label: z.string().min(1).max(100),
  config: z.record(z.unknown()).default({}),
});

export const workflowEdgeSchema = z.object({
  id: stableIdSchema,
  source: stableIdSchema,
  target: stableIdSchema,
  kind: z.enum(["control-flow", "data"]).default("control-flow"),
  sourcePort: z.string().min(1).max(80).optional(),
  targetPort: z.string().min(1).max(80).optional(),
});

export const workflowGraphSchema = z.object({
  id: stableIdSchema,
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  schemaVersion: schemaVersionSchema.default("1.0"),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export const infrastructureResourceSchema = z.object({
  id: stableIdSchema,
  componentId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().min(1).max(100),
  provider: z.enum(["aws", "gcp", "azure", "generic"]),
  config: z.record(z.unknown()).default({}),
  tags: z.record(z.string()).default({}),
});

export const infrastructureEdgeSchema = z.object({
  id: stableIdSchema,
  source: stableIdSchema,
  target: stableIdSchema,
  relationship: z.enum([
    "contains",
    "connects-to",
    "routes-to",
    "attaches-to",
    "depends-on",
    "grants-access-to",
    "sends-to",
  ]),
  sourcePort: z.string().min(1).max(80).optional(),
  targetPort: z.string().min(1).max(80).optional(),
});

export const infrastructureGraphSchema = z.object({
  id: stableIdSchema,
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  schemaVersion: schemaVersionSchema.default("1.0"),
  resources: z.array(infrastructureResourceSchema),
  relationships: z.array(infrastructureEdgeSchema),
});

export type StableId = z.infer<typeof stableIdSchema>;
export type ResourceReference = z.infer<typeof resourceReferenceSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type InfrastructureResource = z.infer<typeof infrastructureResourceSchema>;
export type InfrastructureEdge = z.infer<typeof infrastructureEdgeSchema>;
export type InfrastructureGraph = z.infer<typeof infrastructureGraphSchema>;

export interface GraphValidationIssue {
  code:
    | "schema"
    | "duplicate-node-id"
    | "duplicate-edge-id"
    | "missing-endpoint"
    | "self-edge"
    | "duplicate-edge"
    | "cycle"
    | "missing-trigger"
    | "unreachable-node"
    | "unknown-component"
    | "invalid-config"
    | "provider-mismatch"
    | "invalid-port";
  message: string;
  path?: string;
}

export interface GraphValidationResult {
  valid: boolean;
  issues: GraphValidationIssue[];
}

function detectCycle(adjacency: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of adjacency.keys()) {
    if (visit(id)) return true;
  }
  return false;
}

export function validateWorkflowGraph(input: unknown): GraphValidationResult {
  const parsed = workflowGraphSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "schema" as const,
        path: issue.path.join("."),
        message: `${issue.path.length ? issue.path.join(".") + ": " : ""}${issue.message}`,
      })),
    };
  }

  const graph = parsed.data;
  const issues: GraphValidationIssue[] = [];
  const componentByWorkflowType: Partial<Record<WorkflowNode["type"], string>> = {
    trigger: "workflow.trigger",
    build: "workflow.build",
    approval: "workflow.approval",
  };
  for (const node of graph.nodes) {
    const componentId = componentByWorkflowType[node.type];
    if (!componentId) continue;
    const definition = getComponentDefinition(componentId);
    if (!definition) continue;
    const configResult = validateComponentConfig(definition, node.config);
    if (!configResult.success) {
      for (const message of configResult.errors) {
        issues.push({ code: "invalid-config", path: `nodes.${node.id}.config`, message: `Node "${node.label}": ${message}` });
      }
    }
  }
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push({ code: "duplicate-node-id", path: "nodes", message: `Duplicate node ID "${node.id}".` });
    nodeIds.add(node.id);
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) issues.push({ code: "duplicate-edge-id", path: "edges", message: `Duplicate edge ID "${edge.id}".` });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({ code: "missing-endpoint", path: `edges.${edge.id}`, message: `Edge "${edge.id}" references a node that does not exist.` });
      continue;
    }
    if (edge.sourcePort || edge.targetPort) {
      const sourceNode = graph.nodes.find((node) => node.id === edge.source);
      const targetNode = graph.nodes.find((node) => node.id === edge.target);
      const sourceDefinition = sourceNode ? getComponentDefinition(componentByWorkflowType[sourceNode.type] ?? "") : undefined;
      const targetDefinition = targetNode ? getComponentDefinition(componentByWorkflowType[targetNode.type] ?? "") : undefined;
      const sourcePort = sourceDefinition?.metadata.outputs.find((port) => port.id === edge.sourcePort);
      const targetPort = targetDefinition?.metadata.inputs.find((port) => port.id === edge.targetPort);
      if (!sourcePort || !targetPort) {
        issues.push({ code: "invalid-port", path: `edges.${edge.id}`, message: `Edge "${edge.id}" must reference a supported output port and input port.` });
      } else {
        const compatibility = validatePortConnection(sourcePort, targetPort);
        if (!compatibility.compatible) {
          issues.push({ code: "invalid-port", path: `edges.${edge.id}`, message: compatibility.message ?? `Edge "${edge.id}" has incompatible ports.` });
        }
      }
    }
    if (edge.source === edge.target) {
      issues.push({ code: "self-edge", path: `edges.${edge.id}`, message: `Edge "${edge.id}" cannot connect a node to itself.` });
      continue;
    }
    const pair = `${edge.source}→${edge.target}:${edge.kind}`;
    if (edgePairs.has(pair)) issues.push({ code: "duplicate-edge", path: `edges.${edge.id}`, message: `Duplicate ${edge.kind} edge from "${edge.source}" to "${edge.target}".` });
    edgePairs.add(pair);
    adjacency.get(edge.source)?.push(edge.target);
  }
  if (!graph.nodes.some((node) => node.type === "trigger")) {
    issues.push({ code: "missing-trigger", path: "nodes", message: "A workflow must include at least one trigger node." });
  }
  if (detectCycle(adjacency)) {
    issues.push({ code: "cycle", path: "edges", message: "Workflow cycles are not supported by the current graph contract." });
  }
  const triggerIds = graph.nodes.filter((node) => node.type === "trigger").map((node) => node.id);
  const reachable = new Set<string>();
  const pending = [...triggerIds];
  while (pending.length) {
    const current = pending.pop();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  for (const node of graph.nodes) {
    if (node.type !== "trigger" && !reachable.has(node.id)) {
      issues.push({ code: "unreachable-node", path: `nodes.${node.id}`, message: `Node "${node.label}" is not reachable from a trigger.` });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateInfrastructureGraph(input: unknown): GraphValidationResult {
  const parsed = infrastructureGraphSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "schema",
        path: issue.path.join("."),
        message: `${issue.path.length ? issue.path.join(".") + ": " : ""}${issue.message}`,
      })),
    };
  }

  const graph = parsed.data;
  const issues: GraphValidationIssue[] = [];
  const resourceIds = new Set<string>();
  const edgeIds = new Set<string>();
  const relationshipKeys = new Set<string>();
  const dependencyAdjacency = new Map<string, string[]>();
  for (const resource of graph.resources) dependencyAdjacency.set(resource.id, []);
  for (const resource of graph.resources) {
    if (resourceIds.has(resource.id)) issues.push({ code: "duplicate-node-id", path: "resources", message: `Duplicate resource ID "${resource.id}".` });
    resourceIds.add(resource.id);
    const definition = getComponentDefinition(resource.componentId);
    if (!definition || definition.metadata.family !== "infrastructure-resource") {
      issues.push({ code: "unknown-component", path: `resources.${resource.id}.componentId`, message: `Resource "${resource.label}" uses unsupported infrastructure component "${resource.componentId}".` });
      continue;
    }
    const providerFromId = resource.componentId.split(".")[1];
    if (providerFromId && providerFromId !== resource.provider && providerFromId !== "generic") {
      issues.push({ code: "provider-mismatch", path: `resources.${resource.id}.provider`, message: `Resource "${resource.label}" component expects provider "${providerFromId}", not "${resource.provider}".` });
    }
    const configResult = validateComponentConfig(definition, resource.config);
    if (!configResult.success) {
      for (const message of configResult.errors) {
        issues.push({ code: "invalid-config", path: `resources.${resource.id}.config`, message: `Resource "${resource.label}": ${message}` });
      }
    }
  }
  for (const edge of graph.relationships) {
    if (edgeIds.has(edge.id)) issues.push({ code: "duplicate-edge-id", path: "relationships", message: `Duplicate relationship ID "${edge.id}".` });
    edgeIds.add(edge.id);
    if (!resourceIds.has(edge.source) || !resourceIds.has(edge.target)) {
      issues.push({ code: "missing-endpoint", path: `relationships.${edge.id}`, message: `Relationship "${edge.id}" references a resource that does not exist.` });
      continue;
    }
    if (edge.sourcePort || edge.targetPort) {
      const sourceResource = graph.resources.find((resource) => resource.id === edge.source);
      const targetResource = graph.resources.find((resource) => resource.id === edge.target);
      const sourceDefinition = sourceResource ? getComponentDefinition(sourceResource.componentId) : undefined;
      const targetDefinition = targetResource ? getComponentDefinition(targetResource.componentId) : undefined;
      const sourcePort = sourceDefinition?.metadata.outputs.find((port) => port.id === edge.sourcePort);
      const targetPort = targetDefinition?.metadata.inputs.find((port) => port.id === edge.targetPort);
      if (!sourcePort || !targetPort) {
        issues.push({ code: "invalid-port", path: `relationships.${edge.id}`, message: `Relationship "${edge.id}" must reference a supported output port and input port.` });
      } else {
        const compatibility = validatePortConnection(sourcePort, targetPort);
        if (!compatibility.compatible) {
          issues.push({ code: "invalid-port", path: `relationships.${edge.id}`, message: compatibility.message ?? `Relationship "${edge.id}" has incompatible ports.` });
        }
      }
    }
    if (edge.relationship === "depends-on" || edge.relationship === "contains") {
      dependencyAdjacency.get(edge.source)?.push(edge.target);
    }
    if (edge.source === edge.target) {
      issues.push({ code: "self-edge", path: `relationships.${edge.id}`, message: `Relationship "${edge.id}" cannot reference itself.` });
    }
    const key = `${edge.source}→${edge.target}:${edge.relationship}`;
    if (relationshipKeys.has(key)) issues.push({ code: "duplicate-edge", path: `relationships.${edge.id}`, message: `Duplicate "${edge.relationship}" relationship between these resources.` });
    relationshipKeys.add(key);
  }
  if (detectCycle(dependencyAdjacency)) {
    issues.push({ code: "cycle", path: "relationships", message: "Infrastructure contains a cycle in its containment/dependency relationships." });
  }
  return { valid: issues.length === 0, issues };
}
