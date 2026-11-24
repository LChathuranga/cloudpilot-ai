import { z } from "zod";
import {
  workflowNodeTypes,
  workflowNodeSchema,
  workflowEdgeSchema,
  workflowGraphSchema,
  type WorkflowGraph as SharedWorkflowGraph,
} from "../common/graph-core.js";

export { workflowNodeTypes, workflowNodeSchema, workflowEdgeSchema, workflowGraphSchema };
export type WorkflowNodeType = (typeof workflowNodeTypes)[number];
// Input types permit defaulted schema fields to be omitted by existing editor callers.
export type WorkflowGraph = z.input<typeof workflowGraphSchema>;
export type ParsedWorkflowGraph = SharedWorkflowGraph;

export function validateWorkflowGraph(graph: unknown): string[] {
  const parsed = workflowGraphSchema.safeParse(graph);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => issue.message);
  }

  const validGraph = parsed.data;

  const ids = new Set(validGraph.nodes.map((node) => node.id));
  const errors: string[] = [];
  const edgePairs = new Set<string>();
  const edgeIds = new Set<string>();
  const adjacency = new Map<string, string[]>();

  if (ids.size !== validGraph.nodes.length) {
    errors.push("Every node must have a unique ID.");
  }
  if (validGraph.nodes.length === 0) {
    errors.push("Add at least one node before running the workflow.");
  }
  if (!validGraph.nodes.some((node) => node.type === "trigger")) {
    errors.push("Add a Trigger node to define how the workflow starts.");
  }
  if (validGraph.nodes.length > 0 && !validGraph.nodes.some((node) => node.type !== "trigger")) {
    errors.push("Add at least one action node after the Trigger.");
  }

  for (const node of validGraph.nodes) {
    const config = node.config;
    const requireText = (key: string, label: string) => {
      if (typeof config[key] !== "string" || !String(config[key]).trim()) {
        errors.push(`${node.type === "deploy" ? "Deploy" : node.type === "source" ? "Source" : node.type === "health-check" ? "Health check" : node.type === "rollback" ? "Rollback" : node.type === "trigger" ? "Trigger" : node.type === "security-scan" ? "Security scan" : node.type === "approval" ? "Approval" : node.type === "build" ? "Build" : "Test"} node "${node.label}" needs ${label}.`);
      }
    };

    if (node.type === "trigger") {
      if (typeof config.event !== "string" || !["manual", "push", "pull_request", "schedule"].includes(config.event)) {
        errors.push(`Trigger node "${node.label}" needs a supported trigger event.`);
      }
      requireText("branch", "a branch name");
    }
    if (node.type === "source") {
      requireText("repository", "a repository URL");
      requireText("branch", "a branch name");
    }
    if (node.type === "build") requireText("command", "a build command");
    if (node.type === "test") requireText("command", "a test command");
    if (node.type === "security-scan") {
      if (typeof config.scanner !== "string" || !["trivy", "npm-audit", "snyk", "sonarqube"].includes(config.scanner)) {
        errors.push(`Security scan node "${node.label}" needs a supported scanner.`);
      }
      if (typeof config.severityThreshold !== "string" || !["low", "medium", "high", "critical"].includes(config.severityThreshold)) {
        errors.push(`Security scan node "${node.label}" needs a valid severity threshold.`);
      }
    }
    if (node.type === "approval" && config.required === true) {
      // An approver label is useful but optional in the local mock prototype.
    }
    if (node.type === "deploy") {
      if (typeof config.provider !== "string" || !["aws", "gcp", "azure", "mock"].includes(config.provider)) {
        errors.push(`Deploy node "${node.label}" needs a supported provider.`);
      }
      if (typeof config.environment !== "string" || !["development", "staging", "production"].includes(config.environment)) {
        errors.push(`Deploy node "${node.label}" needs a supported environment.`);
      }
      requireText("target", "a deployment target");
    }
    if (node.type === "health-check") {
      requireText("url", "a health-check URL");
      const status = Number(config.expectedStatus);
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        errors.push(`Health check node "${node.label}" needs a valid HTTP status code (100–599).`);
      }
      const timeout = Number(config.timeoutSeconds);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        errors.push(`Health check node "${node.label}" needs a positive timeout.`);
      }
    }
    if (node.type === "rollback") requireText("target", "a rollback target");
  }

  for (const edge of validGraph.edges) {
    if (edgeIds.has(edge.id)) errors.push("Every connection must have a unique ID.");
    edgeIds.add(edge.id);
    if (!ids.has(edge.source)) errors.push(`Connection ${edge.id} has a missing source node.`);
    if (!ids.has(edge.target)) errors.push(`Connection ${edge.id} has a missing target node.`);
    if (edge.source === edge.target) {
      errors.push(`Connection ${edge.id} cannot loop to the same node.`);
      continue;
    }
    const pair = `${edge.source}→${edge.target}`;
    if (edgePairs.has(pair)) errors.push(`Duplicate connection from "${edge.source}" to "${edge.target}" is not allowed.`);
    edgePairs.add(pair);
    if (ids.has(edge.source) && ids.has(edge.target)) {
      adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    }
  }

  const triggerIds = validGraph.nodes.filter((node) => node.type === "trigger").map((node) => node.id);
  const reachable = new Set<string>();
  const pending = [...triggerIds];
  while (pending.length) {
    const current = pending.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  for (const node of validGraph.nodes) {
    if (node.type !== "trigger" && !reachable.has(node.id)) {
      errors.push(`Node "${node.label}" is not reachable from a Trigger. Connect it into the workflow.`);
    }
  }

  // All current workflow node types are modeled as a directed acyclic graph.
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
  for (const id of ids) {
    if (visit(id)) {
      errors.push("Workflow contains a cycle. Cycles are not supported in this MVP.");
      break;
    }
  }

  return [...new Set(errors)];
}
