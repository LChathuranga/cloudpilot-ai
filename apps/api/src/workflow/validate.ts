import { workflowGraphSchema, type WorkflowGraph } from "./schema.js";

export type ValidationIssue = {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
};

export function validateWorkflow(input: unknown): { valid: boolean; issues: ValidationIssue[]; graph?: WorkflowGraph } {
  const parsed = workflowGraphSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "SCHEMA_INVALID",
        message: `${issue.path.join(".") || "graph"}: ${issue.message}`
      }))
    };
  }

  const graph = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, nodeId?: string, edgeId?: string) =>
    issues.push({ code, message, ...(nodeId ? { nodeId } : {}), ...(edgeId ? { edgeId } : {}) });
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  const adjacency = new Map<string, string[]>();

  if (nodeIds.size !== graph.nodes.length) add("DUPLICATE_NODE_ID", "Every node must have a unique ID.");
  if (graph.nodes.length === 0) add("EMPTY_WORKFLOW", "Add at least one node.");
  const triggers = graph.nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) add("TRIGGER_REQUIRED", "Add a Trigger node.");
  if (graph.nodes.length > 0 && graph.nodes.every((n) => n.type === "trigger")) {
    add("ACTION_REQUIRED", "Add at least one action node after the Trigger.");
  }

  const requireText = (node: WorkflowGraph["nodes"][number], key: string, label: string) => {
    const value = node.config[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      add(`${node.type.toUpperCase().replaceAll("-", "_")}_${key.toUpperCase()}_REQUIRED`,
        `${node.type} node "${node.label}" needs ${label}.`, node.id);
    }
  };

  for (const node of graph.nodes) {
    const c = node.config;
    if (node.type === "trigger") {
      if (!["manual", "push", "pull_request", "schedule"].includes(String(c.event))) {
        add("TRIGGER_EVENT_INVALID", `Trigger "${node.label}" needs a supported event.`, node.id);
      }
      requireText(node, "branch", "a branch name");
    } else if (node.type === "source") {
      requireText(node, "repository", "a repository URL");
      requireText(node, "branch", "a branch name");
      const repo = c.repository;
      if (typeof repo === "string" && repo.trim()) {
        try {
          const url = new URL(repo);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
        } catch {
          add("SOURCE_REPOSITORY_URL_INVALID", "Repository must be a valid HTTP(S) URL.", node.id);
        }
      }
    } else if (node.type === "build") {
      requireText(node, "command", "a build command");
    } else if (node.type === "test") {
      requireText(node, "command", "a test command");
    } else if (node.type === "security-scan") {
      if (!["trivy", "npm-audit", "snyk", "sonarqube"].includes(String(c.scanner))) {
        add("SECURITY_SCANNER_INVALID", "Choose a supported security scanner.", node.id);
      }
      if (!["low", "medium", "high", "critical"].includes(String(c.severityThreshold))) {
        add("SECURITY_THRESHOLD_INVALID", "Choose a supported severity threshold.", node.id);
      }
    } else if (node.type === "deploy") {
      if (!["aws", "gcp", "azure", "mock"].includes(String(c.provider))) {
        add("DEPLOY_PROVIDER_INVALID", "Choose a supported deployment provider.", node.id);
      }
      if (!["development", "staging", "production"].includes(String(c.environment))) {
        add("DEPLOY_ENVIRONMENT_INVALID", "Choose a supported environment.", node.id);
      }
      requireText(node, "target", "a deployment target");
    } else if (node.type === "health-check") {
      requireText(node, "url", "a health-check URL");
      if (typeof c.url === "string" && c.url.trim()) {
        try {
          const url = new URL(c.url);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
        } catch {
          add("HEALTH_URL_INVALID", "Health-check URL must be a valid HTTP(S) URL.", node.id);
        }
      }
      const status = Number(c.expectedStatus);
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        add("HEALTH_STATUS_INVALID", "Expected HTTP status must be between 100 and 599.", node.id);
      }
      const timeout = Number(c.timeoutSeconds);
      if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300) {
        add("HEALTH_TIMEOUT_INVALID", "Health-check timeout must be between 1 and 300 seconds.", node.id);
      }
    } else if (node.type === "rollback") {
      requireText(node, "target", "a rollback target");
    }
  }

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) add("DUPLICATE_EDGE_ID", "Every connection must have a unique ID.", undefined, edge.id);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) add("EDGE_SOURCE_MISSING", "Connection source node does not exist.", undefined, edge.id);
    if (!nodeIds.has(edge.target)) add("EDGE_TARGET_MISSING", "Connection target node does not exist.", undefined, edge.id);
    if (edge.source === edge.target) {
      add("SELF_CONNECTION", "A node cannot connect to itself.", undefined, edge.id);
      continue;
    }
    const pair = `${edge.source}->${edge.target}`;
    if (pairs.has(pair)) add("DUPLICATE_CONNECTION", "Duplicate connections are not allowed.", undefined, edge.id);
    pairs.add(pair);
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    }
  }

  const reachable = new Set<string>();
  const pending = triggers.map((n) => n.id);
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(adjacency.get(id) ?? []));
  }
  for (const node of graph.nodes) {
    if (node.type !== "trigger" && !reachable.has(node.id)) {
      add("NODE_UNREACHABLE", `Node "${node.label}" is not reachable from a Trigger.`, node.id);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let hasCycle = false;
  const visit = (id: string): void => {
    if (visiting.has(id)) { hasCycle = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodeIds) visit(id);
  if (hasCycle) add("WORKFLOW_CYCLE", "Workflow contains a cycle. Cycles are not supported in this MVP.");

  const unique = [...new Map(issues.map((issue) => [
    `${issue.code}:${issue.nodeId ?? ""}:${issue.edgeId ?? ""}:${issue.message}`, issue
  ])).values()];
  return { valid: unique.length === 0, issues: unique, ...(unique.length === 0 ? { graph } : {}) };
}
