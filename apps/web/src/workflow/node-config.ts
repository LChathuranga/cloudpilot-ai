import { MarkerType, type Edge } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeType } from "./schema";
import type { NodeConfig, NodeCatalogItem, SettingField, WorkflowNodeData } from "./workflow-types";

export const SAVED_WORKFLOWS_KEY = "cloudpilot-ai:saved-workflows:v1";

export const nodeSettings: Record<WorkflowNodeType, SettingField[]> = {
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

export function defaultNodeConfig(kind: WorkflowNodeType): NodeConfig {
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

export const initialNodes: Node<WorkflowNodeData>[] = [
  { id: "trigger", className: "workflow-node workflow-node-trigger", position: { x: 60, y: 150 }, data: { label: "Start", kind: "trigger", description: "Workflow entry point", config: defaultNodeConfig("trigger") } },
  { id: "source", className: "workflow-node workflow-node-source", position: { x: 290, y: 150 }, data: { label: "Checkout source", kind: "source", description: "Prepare source code", config: defaultNodeConfig("source") } },
  { id: "build", className: "workflow-node workflow-node-build", position: { x: 520, y: 150 }, data: { label: "Build application", kind: "build", description: "Build the project artifact", config: defaultNodeConfig("build") } },
  { id: "test", className: "workflow-node workflow-node-test", position: { x: 750, y: 150 }, data: { label: "Run tests", kind: "test", description: "Run the configured test suite", config: defaultNodeConfig("test") } },
  { id: "approval", className: "workflow-node workflow-node-approval", position: { x: 980, y: 150 }, data: { label: "Manual approval", kind: "approval", description: "Human review before deployment", config: defaultNodeConfig("approval") } },
  { id: "deploy", className: "workflow-node workflow-node-deploy", position: { x: 1210, y: 150 }, data: { label: "Deploy (mock)", kind: "deploy", description: "Simulate deployment; no cloud changes", config: defaultNodeConfig("deploy") } },
];

export const initialEdges: Edge[] = [
  { id: "e-trigger-source", source: "trigger", target: "source", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-source-build", source: "source", target: "build", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-build-test", source: "build", target: "test", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-test-approval", source: "test", target: "approval", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
  { id: "e-approval-deploy", source: "approval", target: "deploy", type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" } },
];

export const kindIcon: Record<WorkflowNodeType, string> = {
  trigger: "◉", source: "⑂", build: "▣", test: "✓", "security-scan": "⌁",
  approval: "◎", deploy: "⇧", "health-check": "♥", rollback: "↶",
};

export const nodeCatalog: NodeCatalogItem[] = [
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

export function inferNodeType(line: string): WorkflowNodeType | null {
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
