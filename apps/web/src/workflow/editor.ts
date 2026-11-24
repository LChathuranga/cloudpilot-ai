import { MarkerType, type Edge, type Node } from "@xyflow/react";
import {
  deployEnvironments,
  deployProviders,
  nodeTypeLabels,
  rollbackStrategies,
  securityScanners,
  severityLevels,
  triggerEvents,
  type NodeConfig,
  type NodeConfigFor,
  type WorkflowGraph,
  type WorkflowNodeType,
} from "./schema";

/** Data stored on each React Flow node on the canvas. */
export type WorkflowNodeData = {
  label: string;
  config: NodeConfig;
  kind: WorkflowNodeType;
  description: string;
  importBatchId?: string;
};

export type WorkflowCanvasNode = Node<WorkflowNodeData>;

// ---------------------------------------------------------------------------
// Node catalog (sidebar)
// ---------------------------------------------------------------------------

type CatalogEntry = { label: string; description: string; icon: string; iconClass: string };

const catalogEntries: Record<WorkflowNodeType, Omit<CatalogEntry, "label">> = {
  trigger: { description: "Start workflow", icon: "◉", iconClass: "trigger-icon" },
  source: { description: "Checkout repository", icon: "⑂", iconClass: "source-icon" },
  build: { description: "Build application", icon: "▣", iconClass: "build-icon" },
  test: { description: "Run test suite", icon: "✓", iconClass: "test-icon" },
  "security-scan": { description: "Check known risks", icon: "⌁", iconClass: "scan-icon" },
  approval: { description: "Human checkpoint", icon: "◎", iconClass: "approval-icon" },
  deploy: { description: "Mock deployment", icon: "⇧", iconClass: "deploy-icon" },
  "health-check": { description: "Verify service health", icon: "♥", iconClass: "test-icon" },
  rollback: { description: "Recovery step", icon: "↶", iconClass: "approval-icon" },
};

export const nodeCatalog = (Object.keys(catalogEntries) as WorkflowNodeType[]).map((kind) => ({
  kind,
  label: nodeTypeLabels[kind],
  ...catalogEntries[kind],
}));

export function catalogEntry(kind: WorkflowNodeType) {
  return { kind, label: nodeTypeLabels[kind], ...catalogEntries[kind] };
}

// ---------------------------------------------------------------------------
// Default settings. `satisfies` makes TypeScript check every default against
// the validation schema, so a typo in a key or an unsupported value fails to compile.
// ---------------------------------------------------------------------------

const nodeDefaults = {
  trigger: { event: "manual", branch: "main" },
  source: { repository: "", branch: "main" },
  build: { command: "npm ci && npm run build", workingDirectory: ".", artifactPath: "dist/" },
  test: { command: "npm test", workingDirectory: ".", continueOnFailure: false },
  "security-scan": { scanner: "trivy", severityThreshold: "high" },
  approval: { required: true, approver: "" },
  deploy: { provider: "mock", environment: "staging", target: "", region: "" },
  "health-check": { url: "", expectedStatus: "200", timeoutSeconds: "30" },
  rollback: { strategy: "previous-revision", target: "" },
} satisfies { [K in WorkflowNodeType]: NodeConfigFor<K> & NodeConfig };

export function defaultNodeConfig(kind: WorkflowNodeType): NodeConfig {
  return { ...nodeDefaults[kind] };
}

// ---------------------------------------------------------------------------
// Settings form (node inspector). Dropdown options come from the schema's
// allowed values; each value must have a label or this file fails to compile.
// ---------------------------------------------------------------------------

export type SettingField = {
  key: string;
  label: string;
  description: string;
  input: "text" | "textarea" | "select" | "checkbox";
  options?: { label: string; value: string }[];
};

function options<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const nodeSettings: { [K in WorkflowNodeType]: (SettingField & { key: keyof NodeConfigFor<K> & string })[] } = {
  trigger: [
    { key: "event", label: "Trigger event", description: "What starts this workflow?", input: "select", options: options(triggerEvents, { manual: "Manual", push: "Push to branch", pull_request: "Pull request", schedule: "Schedule" }) },
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
    { key: "scanner", label: "Scanner", description: "Security scanner to use", input: "select", options: options(securityScanners, { trivy: "Trivy", "npm-audit": "npm audit", snyk: "Snyk", sonarqube: "SonarQube" }) },
    { key: "severityThreshold", label: "Fail at severity", description: "Minimum finding severity that should fail the step", input: "select", options: options(severityLevels, { low: "Low", medium: "Medium", high: "High", critical: "Critical" }) },
  ],
  approval: [
    { key: "required", label: "Require approval", description: "Pause for a human decision", input: "checkbox" },
    { key: "approver", label: "Approver or team", description: "Who should review this step?", input: "text" },
  ],
  deploy: [
    { key: "provider", label: "Cloud provider", description: "Target provider", input: "select", options: options(deployProviders, { aws: "AWS", gcp: "Google Cloud", azure: "Azure", mock: "Local / mock" }) },
    { key: "environment", label: "Environment", description: "Deployment environment", input: "select", options: options(deployEnvironments, { development: "Development", staging: "Staging", production: "Production" }) },
    { key: "target", label: "Deployment target", description: "Service, cluster, or app name", input: "text" },
    { key: "region", label: "Region", description: "Cloud region (if applicable)", input: "text" },
  ],
  "health-check": [
    { key: "url", label: "Health-check URL", description: "Endpoint to check", input: "text" },
    { key: "expectedStatus", label: "Expected HTTP status", description: "Expected response code", input: "text" },
    { key: "timeoutSeconds", label: "Timeout (seconds)", description: "Maximum time to wait", input: "text" },
  ],
  rollback: [
    { key: "strategy", label: "Rollback strategy", description: "How to recover", input: "select", options: options(rollbackStrategies, { "previous-revision": "Previous revision", "blue-green": "Blue/green switch", manual: "Manual recovery" }) },
    { key: "target", label: "Target service", description: "Service to recover", input: "text" },
  ],
};

// ---------------------------------------------------------------------------
// Canvas → workflow graph (what validation checks)
// ---------------------------------------------------------------------------

export function toWorkflowGraph(
  meta: { id: string; name: string; version: number },
  nodes: WorkflowCanvasNode[],
  edges: Edge[],
): WorkflowGraph {
  return {
    ...meta,
    nodes: nodes.map((node) => ({ id: node.id, type: node.data.kind, label: node.data.label, config: node.data.config })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  };
}

// ---------------------------------------------------------------------------
// Script import heuristics. Lines are only read as text, never executed.
// ---------------------------------------------------------------------------

export type ImportSuggestion = { line: string; kind: WorkflowNodeType; config: NodeConfig };

export function inferNodeType(line: string): WorkflowNodeType | null {
  const command = line.trim().toLowerCase();
  if (!command || command.startsWith("#") || command.startsWith("rem ") || command.startsWith("::")) return null;
  if (/^(echo|@echo|set |cd |pushd |call )/.test(command)) return null;
  if (/\b(trivy|snyk|sonar-scanner|sonar)\b|\b(npm|pnpm|yarn) audit\b/.test(command)) return "security-scan";
  if (/\b(npm|pnpm|yarn|pip|dotnet|mvn|gradle)\b.*\b(build|install|ci|publish)\b/.test(command)) return "build";
  if (/\b(test|tests|pytest|jest|vitest|playwright|cypress)\b/.test(command)) return "test";
  if (/\bdocker (build|push|login)\b/.test(command)) return "build";
  if (/\b(aws|az|gcloud|kubectl|helm|terraform|pulumi)\b|\bdeploy\b/.test(command)) return "deploy";
  if (/\b(curl|wget)\b|health/.test(command)) return "health-check";
  return null;
}

/** Pre-fills a suggested node's settings from the script line it came from. */
export function suggestConfig(kind: WorkflowNodeType, line: string): NodeConfig {
  const config = defaultNodeConfig(kind);
  const lower = line.toLowerCase();
  if (kind === "build" || kind === "test") config.command = line;
  if (kind === "security-scan") {
    if (/\baudit\b/.test(lower)) config.scanner = "npm-audit";
    else if (/\bsnyk\b/.test(lower)) config.scanner = "snyk";
    else if (/\bsonar/.test(lower)) config.scanner = "sonarqube";
    else if (/\btrivy\b/.test(lower)) config.scanner = "trivy";
  }
  if (kind === "health-check") {
    const url = line.match(/https?:\/\/[^\s"'<>]+/);
    if (url) config.url = url[0];
  }
  return config;
}

export function suggestNodesFromScript(source: string, limit = 12): ImportSuggestion[] {
  return source
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      const kind = inferNodeType(line);
      return kind ? { line, kind, config: suggestConfig(kind, line) } : null;
    })
    .filter((item): item is ImportSuggestion => item !== null)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Canvas presentation
// ---------------------------------------------------------------------------

/** React Flow node type that renders the custom WorkflowNode component. */
export const WORKFLOW_NODE_TYPE = "workflow";

/** Horizontal distance between pipeline steps laid out in a row. */
export const NODE_SPACING_X = 250;

/** Accent colour per node type (node stripe, icon, minimap). */
export const nodeAccent: Record<WorkflowNodeType, string> = {
  trigger: "#2c9d70",
  source: "#4679d8",
  build: "#8262cb",
  test: "#2d9c73",
  "security-scan": "#bd8423",
  approval: "#c05b98",
  deploy: "#4f62d7",
  "health-check": "#208b9c",
  rollback: "#c85a46",
};

/** Shared look for every connection: solid smooth-step line with an arrowhead. */
export const edgeDefaults = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#8f9bc4", width: 18, height: 18 },
} satisfies Partial<Edge>;

function optionLabel(kind: WorkflowNodeType, key: string, value: unknown): string {
  const field = nodeSettings[kind].find((item) => item.key === key);
  return field?.options?.find((option) => option.value === value)?.label ?? String(value ?? "");
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** One line describing a node's most important setting, shown on the canvas. */
export function nodeSummary(kind: WorkflowNodeType, config: NodeConfig): { text: string; missing: boolean } {
  const missing = (message: string) => ({ text: message, missing: true });
  const ok = (message: string) => ({ text: message, missing: false });
  switch (kind) {
    case "trigger":
      return text(config.branch) ? ok(`${optionLabel(kind, "event", config.event)} · ${text(config.branch)}`) : missing("Branch not set");
    case "source":
      return text(config.repository) ? ok(`${text(config.repository).replace(/^https?:\/\//, "")} · ${text(config.branch) || "?"}`) : missing("Repository not set");
    case "build":
    case "test":
      return text(config.command) ? ok(text(config.command)) : missing("Command not set");
    case "security-scan":
      return ok(`${optionLabel(kind, "scanner", config.scanner)} · fail at ${optionLabel(kind, "severityThreshold", config.severityThreshold).toLowerCase()}`);
    case "approval":
      return ok(config.required ? `Required · ${text(config.approver) || "any approver"}` : "Optional");
    case "deploy":
      return text(config.target)
        ? ok(`${optionLabel(kind, "provider", config.provider)} · ${optionLabel(kind, "environment", config.environment)} · ${text(config.target)}`)
        : missing("Target not set");
    case "health-check":
      return text(config.url) ? ok(`${text(config.url).replace(/^https?:\/\//, "")} → ${text(String(config.expectedStatus ?? ""))}`) : missing("URL not set");
    case "rollback":
      return text(config.target) ? ok(`${optionLabel(kind, "strategy", config.strategy)} · ${text(config.target)}`) : missing("Target not set");
  }
}
