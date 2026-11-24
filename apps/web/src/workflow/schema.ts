import { z } from "zod";

// ---------------------------------------------------------------------------
// Node types and allowed setting values.
// These lists are the single source of truth: the editor builds its dropdowns
// from them and validation checks against them.
// ---------------------------------------------------------------------------

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

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

export const nodeTypeLabels: Record<WorkflowNodeType, string> = {
  trigger: "Trigger",
  source: "Source",
  build: "Build",
  test: "Test",
  "security-scan": "Security scan",
  approval: "Approval",
  deploy: "Deploy",
  "health-check": "Health check",
  rollback: "Rollback",
};

export const triggerEvents = ["manual", "push", "pull_request", "schedule"] as const;
export const securityScanners = ["trivy", "npm-audit", "snyk", "sonarqube"] as const;
export const severityLevels = ["low", "medium", "high", "critical"] as const;
export const deployProviders = ["aws", "gcp", "azure", "mock"] as const;
export const deployEnvironments = ["development", "staging", "production"] as const;
export const rollbackStrategies = ["previous-revision", "blue-green", "manual"] as const;

export function isWorkflowNodeType(value: unknown): value is WorkflowNodeType {
  return typeof value === "string" && (workflowNodeTypes as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Per-node settings. Each message completes the sentence
// `<Type> node "<label>" needs ...`.
// ---------------------------------------------------------------------------

const requiredText = (need: string) =>
  z.string({ required_error: need, invalid_type_error: need }).trim().min(1, need);
const oneOf = <T extends readonly [string, ...string[]]>(values: T, need: string) =>
  z.enum(values, { errorMap: () => ({ message: need }) });
const optionalText = z.string().optional();
const optionalFlag = z.boolean().optional();

const httpStatus = z.coerce
  .string()
  .trim()
  .regex(/^\d{3}$/, "a valid HTTP status code (100–599)")
  .refine((value) => Number(value) >= 100 && Number(value) <= 599, "a valid HTTP status code (100–599)");
const positiveSeconds = z.coerce
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "a positive timeout in seconds")
  .refine((value) => Number(value) > 0, "a positive timeout in seconds");

export const nodeConfigSchemas = {
  trigger: z.object({
    event: oneOf(triggerEvents, "a supported trigger event"),
    branch: requiredText("a branch name"),
  }),
  source: z.object({
    repository: requiredText("a repository URL"),
    branch: requiredText("a branch name"),
  }),
  build: z.object({
    command: requiredText("a build command"),
    workingDirectory: optionalText,
    artifactPath: optionalText,
  }),
  test: z.object({
    command: requiredText("a test command"),
    workingDirectory: optionalText,
    continueOnFailure: optionalFlag,
  }),
  "security-scan": z.object({
    scanner: oneOf(securityScanners, "a supported scanner"),
    severityThreshold: oneOf(severityLevels, "a valid severity threshold"),
  }),
  approval: z.object({
    required: optionalFlag,
    approver: optionalText,
  }),
  deploy: z.object({
    provider: oneOf(deployProviders, "a supported provider"),
    environment: oneOf(deployEnvironments, "a supported environment"),
    target: requiredText("a deployment target"),
    region: optionalText,
  }),
  "health-check": z.object({
    url: requiredText("a health-check URL"),
    expectedStatus: httpStatus,
    timeoutSeconds: positiveSeconds,
  }),
  rollback: z.object({
    strategy: oneOf(rollbackStrategies, "a supported rollback strategy"),
    target: requiredText("a rollback target"),
  }),
} satisfies Record<WorkflowNodeType, z.ZodTypeAny>;

// ---------------------------------------------------------------------------
// Connection limits per node type: how many lines may come in and go out.
// `max: 0` means the node has no dot on that side.
// ---------------------------------------------------------------------------

export type ConnectionRange = { min: number; max: number };
export type NodeConnectionLimits = { inputs: ConnectionRange; outputs: ConnectionRange };

const UNLIMITED = Number.POSITIVE_INFINITY;
const none: ConnectionRange = { min: 0, max: 0 };
const exactlyOne: ConnectionRange = { min: 1, max: 1 };
const oneOrMore: ConnectionRange = { min: 1, max: UNLIMITED };
const optional: ConnectionRange = { min: 0, max: UNLIMITED };

export const nodeConnectionLimits: Record<WorkflowNodeType, NodeConnectionLimits> = {
  // Starts the workflow: nothing comes in, and it must lead somewhere.
  trigger: { inputs: none, outputs: oneOrMore },
  // Checks out code once per run, and something must use it.
  source: { inputs: exactlyOne, outputs: oneOrMore },
  build: { inputs: oneOrMore, outputs: optional },
  test: { inputs: oneOrMore, outputs: optional },
  "security-scan": { inputs: oneOrMore, outputs: optional },
  // Approves exactly one step, and must gate something after it.
  approval: { inputs: exactlyOne, outputs: oneOrMore },
  deploy: { inputs: oneOrMore, outputs: optional },
  // Checks the one deployment before it.
  "health-check": { inputs: exactlyOne, outputs: optional },
  // End of a recovery path: nothing follows a rollback.
  rollback: { inputs: oneOrMore, outputs: none },
};

function connections(count: number, direction: "incoming" | "outgoing"): string {
  return `${count} ${direction} connection${count === 1 ? "" : "s"}`;
}

/**
 * Checks whether a new line from `source` to `target` stays within the limits.
 * Returns a message explaining why not, or null when the connection is allowed.
 */
export function checkNewConnection(
  source: { type: WorkflowNodeType; outgoing: number },
  target: { type: WorkflowNodeType; incoming: number },
): string | null {
  const out = nodeConnectionLimits[source.type].outputs;
  const into = nodeConnectionLimits[target.type].inputs;
  if (out.max === 0) return `${nodeTypeLabels[source.type]} nodes cannot have outgoing connections.`;
  if (into.max === 0) return `${nodeTypeLabels[target.type]} nodes cannot have incoming connections.`;
  if (source.outgoing >= out.max) return `${nodeTypeLabels[source.type]} nodes can have at most ${connections(out.max, "outgoing")}.`;
  if (target.incoming >= into.max) return `${nodeTypeLabels[target.type]} nodes can have at most ${connections(into.max, "incoming")}.`;
  return null;
}

/** Short text for a dot's tooltip, e.g. "Incoming: exactly 1" or "Outgoing: 1 or more". */
export function describeRange(range: ConnectionRange): string {
  if (range.min === range.max) return `exactly ${range.min}`;
  if (range.max === UNLIMITED) return range.min === 0 ? "any number" : `${range.min} or more`;
  return `${range.min} to ${range.max}`;
}

/** The settings a node of type K accepts (as entered in the editor). */
export type NodeConfigFor<K extends WorkflowNodeType> = z.input<(typeof nodeConfigSchemas)[K]>;

/** Draft settings as stored on the canvas. They may be incomplete until validated. */
export type NodeConfig = Record<string, string | boolean>;

// ---------------------------------------------------------------------------
// Workflow graph
// ---------------------------------------------------------------------------

export const workflowNodeSchema = z.object({
  id: z.string().min(1, "Every node needs an ID."),
  type: z.enum(workflowNodeTypes),
  label: z.string(),
  config: z.record(z.unknown()).default({}),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1, "Every connection needs an ID."),
  source: z.string(),
  target: z.string(),
});

export const workflowGraphSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  version: z.number().int().positive(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const MAX_WORKFLOW_NAME_LENGTH = 120;
export const MAX_NODE_LABEL_LENGTH = 100;

function describeNode(node: WorkflowNode, index: number): string {
  const label = node.label.trim();
  return `${nodeTypeLabels[node.type]} node ${label ? `"${label}"` : `#${index + 1} (no name)`}`;
}

/** One validation problem. `nodeId` is set when the problem belongs to a single node. */
export type WorkflowIssue = { message: string; nodeId?: string };

/**
 * Checks a workflow graph and returns readable problems (empty when valid).
 * Accepts unknown input so data from storage or other sources can be checked too.
 */
export function validateWorkflowGraph(input: unknown): string[] {
  return [...new Set(findWorkflowIssues(input).map((issue) => issue.message))];
}

/** Same checks as validateWorkflowGraph, keeping which node each problem belongs to. */
export function findWorkflowIssues(input: unknown): WorkflowIssue[] {
  const parsed = workflowGraphSchema.safeParse(input);
  if (!parsed.success) {
    // The data is not shaped like a workflow at all; report where.
    return parsed.error.issues.map((issue) => ({ message: `Invalid workflow data at "${issue.path.join(".") || "root"}": ${issue.message}` }));
  }

  const graph = parsed.data;
  const issues: WorkflowIssue[] = [];
  const addIssue = (message: string, nodeId?: string) => issues.push({ message, nodeId });
  const ids = new Set(graph.nodes.map((node) => node.id));
  const edgePairs = new Set<string>();
  const edgeIds = new Set<string>();
  const adjacency = new Map<string, string[]>();

  const name = graph.name.trim();
  if (!name) addIssue("Give the workflow a name.");
  if (name.length > MAX_WORKFLOW_NAME_LENGTH) addIssue(`Workflow name must be ${MAX_WORKFLOW_NAME_LENGTH} characters or fewer.`);

  if (ids.size !== graph.nodes.length) addIssue("Every node must have a unique ID.");
  if (graph.nodes.length === 0) addIssue("Add at least one node before running the workflow.");
  if (!graph.nodes.some((node) => node.type === "trigger")) addIssue("Add a Trigger node to define how the workflow starts.");
  if (graph.nodes.length > 0 && !graph.nodes.some((node) => node.type !== "trigger")) {
    addIssue("Add at least one action node after the Trigger.");
  }

  graph.nodes.forEach((node, index) => {
    const description = describeNode(node, index);
    const label = node.label.trim();
    if (!label) addIssue(`${description} needs a display name.`, node.id);
    if (label.length > MAX_NODE_LABEL_LENGTH) addIssue(`${description} has a display name longer than ${MAX_NODE_LABEL_LENGTH} characters.`, node.id);

    const config = nodeConfigSchemas[node.type].safeParse(node.config);
    if (!config.success) {
      for (const issue of config.error.issues) addIssue(`${description} needs ${issue.message}.`, node.id);
    }
  });

  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) addIssue("Every connection must have a unique ID.");
    edgeIds.add(edge.id);
    if (!ids.has(edge.source)) addIssue(`Connection ${edge.id} has a missing source node.`);
    if (!ids.has(edge.target)) addIssue(`Connection ${edge.id} has a missing target node.`);
    if (edge.source === edge.target) {
      addIssue(`Connection ${edge.id} cannot loop to the same node.`);
      continue;
    }
    const pair = `${edge.source}→${edge.target}`;
    if (edgePairs.has(pair)) addIssue(`Duplicate connection from "${edge.source}" to "${edge.target}" is not allowed.`);
    edgePairs.add(pair);
    if (ids.has(edge.source) && ids.has(edge.target)) {
      adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    }
  }

  // Connection limits per node type (see nodeConnectionLimits).
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const [source, targets] of adjacency) {
    outgoing.set(source, targets.length);
    for (const target of targets) incoming.set(target, (incoming.get(target) ?? 0) + 1);
  }
  graph.nodes.forEach((node, index) => {
    const limits = nodeConnectionLimits[node.type];
    const description = describeNode(node, index);
    const checks = [
      { count: incoming.get(node.id) ?? 0, range: limits.inputs, direction: "incoming" },
      { count: outgoing.get(node.id) ?? 0, range: limits.outputs, direction: "outgoing" },
    ] as const;
    for (const { count, range, direction } of checks) {
      if (range.max === 0 && count > 0) addIssue(`${description} cannot have ${direction} connections.`, node.id);
      else if (count > range.max) addIssue(`${description} can have at most ${connections(range.max, direction)}.`, node.id);
      else if (count < range.min) addIssue(`${description} needs at least ${connections(range.min, direction)}.`, node.id);
    }
  });

  const reachable = new Set<string>();
  const pending = graph.nodes.filter((node) => node.type === "trigger").map((node) => node.id);
  while (pending.length) {
    const current = pending.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  graph.nodes.forEach((node, index) => {
    // A node with too few incoming connections is already reported above.
    const tooFewInputs = (incoming.get(node.id) ?? 0) < nodeConnectionLimits[node.type].inputs.min;
    if (node.type !== "trigger" && !tooFewInputs && !reachable.has(node.id)) {
      addIssue(`${describeNode(node, index)} is not reachable from a Trigger. Connect it into the workflow.`, node.id);
    }
  });

  // All current workflow node types are modelled as a directed acyclic graph.
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
      addIssue("Workflow contains a cycle. Cycles are not supported in this MVP.");
      break;
    }
  }

  return issues;
}
