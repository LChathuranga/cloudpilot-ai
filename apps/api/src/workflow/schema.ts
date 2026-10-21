import { z } from "zod";

export const workflowNodeTypes = [
  "trigger", "source", "build", "test", "security-scan",
  "approval", "deploy", "health-check", "rollback"
] as const;

export const workflowGraphSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  version: z.number().int().positive(),
  nodes: z.array(z.object({
    id: z.string().min(1).max(128),
    type: z.enum(workflowNodeTypes),
    label: z.string().trim().min(1).max(100),
    config: z.record(z.unknown()).default({})
  }).strict()).max(300),
  edges: z.array(z.object({
    id: z.string().min(1).max(128),
    source: z.string().min(1).max(128),
    target: z.string().min(1).max(128)
  }).strict()).max(1000)
}).strict();

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
