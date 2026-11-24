import type { Edge } from "@xyflow/react";
import { z } from "zod";
import { WORKFLOW_NODE_TYPE, edgeDefaults, type WorkflowCanvasNode } from "./editor";
import { workflowNodeTypes } from "./schema";

export const SAVED_WORKFLOWS_KEY = "cloudpilot-ai:saved-workflows:v1";

export type WorkflowSnapshot = { nodes: WorkflowCanvasNode[]; edges: Edge[] };
export type SavedWorkflowVersion = WorkflowSnapshot & { workflowId: string; name: string; version: number; savedAt: string };
export type SavedWorkflow = { id: string; name: string; versions: SavedWorkflowVersion[] };

// Saved data comes from the browser and may be old, edited or corrupted,
// so every version is checked before it reaches the editor.
// `.passthrough()` keeps React Flow's own fields (styles, markers, sizes).
const savedNodeSchema = z
  .object({
    id: z.string().min(1),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z
      .object({
        label: z.string(),
        kind: z.enum(workflowNodeTypes),
        description: z.string().default(""),
        config: z.record(z.union([z.string(), z.boolean()])).default({}),
        importBatchId: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const savedEdgeSchema = z
  .object({ id: z.string().min(1), source: z.string().min(1), target: z.string().min(1) })
  .passthrough();

const savedVersionSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string(),
  version: z.number().int().positive(),
  savedAt: z.string(),
  nodes: z.array(savedNodeSchema),
  edges: z.array(savedEdgeSchema),
});

const savedWorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  versions: z.array(z.unknown()),
});

/** Brings versions saved by older app builds up to the current canvas look. */
function upgradeVersion(version: SavedWorkflowVersion): SavedWorkflowVersion {
  return {
    ...version,
    nodes: version.nodes.map((node) => ({ ...node, type: WORKFLOW_NODE_TYPE, className: undefined })),
    edges: version.edges.map((edge) => ({ ...edge, ...edgeDefaults, animated: false })),
  };
}

export type LoadResult = { workflows: SavedWorkflow[]; skippedVersions: number; unreadable: boolean };

/** Parses stored workflows, keeping every valid version and counting the ones dropped. */
export function parseSavedWorkflows(raw: string | null): LoadResult {
  if (!raw) return { workflows: [], skippedVersions: 0, unreadable: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { workflows: [], skippedVersions: 0, unreadable: true };
  }
  if (!Array.isArray(parsed)) return { workflows: [], skippedVersions: 0, unreadable: true };

  const workflows: SavedWorkflow[] = [];
  let skippedVersions = 0;
  for (const entry of parsed) {
    const workflow = savedWorkflowSchema.safeParse(entry);
    if (!workflow.success) {
      skippedVersions += 1;
      continue;
    }
    const versions: SavedWorkflowVersion[] = [];
    for (const candidate of workflow.data.versions) {
      const version = savedVersionSchema.safeParse(candidate);
      if (version.success) versions.push(upgradeVersion(version.data as SavedWorkflowVersion));
      else skippedVersions += 1;
    }
    if (versions.length) workflows.push({ id: workflow.data.id, name: workflow.data.name, versions });
  }
  return { workflows, skippedVersions, unreadable: false };
}

export function loadSavedWorkflows(): LoadResult {
  try {
    return parseSavedWorkflows(window.localStorage.getItem(SAVED_WORKFLOWS_KEY));
  } catch {
    // Storage can be blocked (private mode, privacy settings).
    return { workflows: [], skippedVersions: 0, unreadable: false };
  }
}

export function storeSavedWorkflows(workflows: SavedWorkflow[]): boolean {
  try {
    window.localStorage.setItem(SAVED_WORKFLOWS_KEY, JSON.stringify(workflows));
    return true;
  } catch {
    return false;
  }
}
