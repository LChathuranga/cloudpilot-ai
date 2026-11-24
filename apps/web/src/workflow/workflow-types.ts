import type { Dispatch, SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeType } from "./schema";

export type NodeConfig = Record<string, string | boolean>;

export type WorkflowNodeData = {
  label: string;
  config: NodeConfig;
  kind: WorkflowNodeType;
  description: string;
  importBatchId?: string;
};

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowSnapshot = { nodes: WorkflowNode[]; edges: Edge[] };
export type SavedWorkflowVersion = WorkflowSnapshot & {
  workflowId: string;
  name: string;
  version: number;
  savedAt: string;
};
export type SavedWorkflow = {
  id: string;
  name: string;
  versions: SavedWorkflowVersion[];
};

export type SettingField = {
  key: string;
  label: string;
  description: string;
  input?: "text" | "textarea" | "select" | "checkbox";
  options?: { label: string; value: string }[];
};

export type NodeCatalogItem = {
  kind: WorkflowNodeType;
  label: string;
  description: string;
  icon: string;
  iconClass: string;
};

export type NodeSetter = Dispatch<SetStateAction<WorkflowNode[]>>;
