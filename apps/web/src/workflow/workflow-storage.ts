import type { Edge } from "@xyflow/react";
import { SAVED_WORKFLOWS_KEY } from "./node-config";
import type { SavedWorkflow, SavedWorkflowVersion, WorkflowNode } from "./workflow-types";

export function loadSavedWorkflows(): SavedWorkflow[] {
  try {
    const stored = window.localStorage.getItem(SAVED_WORKFLOWS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed as SavedWorkflow[] : [];
  } catch {
    return [];
  }
}

export function persistSavedWorkflows(workflows: SavedWorkflow[]): boolean {
  try {
    window.localStorage.setItem(SAVED_WORKFLOWS_KEY, JSON.stringify(workflows));
    return true;
  } catch {
    return false;
  }
}

type CreateVersionArgs = {
  savedWorkflows: SavedWorkflow[];
  workflowId: string;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: Edge[];
};

export function createSavedWorkflowVersion(args: CreateVersionArgs): {
  workflows: SavedWorkflow[];
  snapshot: SavedWorkflowVersion;
} {
  const existing = args.savedWorkflows.find((workflow) => workflow.id === args.workflowId);
  const version = (existing?.versions.reduce((max, item) => Math.max(max, item.version), 0) ?? 0) + 1;
  const snapshot: SavedWorkflowVersion = {
    workflowId: args.workflowId,
    name: args.workflowName.trim() || "Untitled workflow",
    version,
    savedAt: new Date().toISOString(),
    nodes: args.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data, config: { ...node.data.config } },
    })),
    edges: args.edges.map((edge) => ({ ...edge })),
  };

  const workflows = existing
    ? args.savedWorkflows.map((workflow) => workflow.id === args.workflowId
      ? { ...workflow, name: snapshot.name, versions: [...workflow.versions, snapshot] }
      : workflow)
    : [...args.savedWorkflows, { id: args.workflowId, name: snapshot.name, versions: [snapshot] }];

  return { workflows, snapshot };
}
