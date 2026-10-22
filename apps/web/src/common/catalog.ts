import { z } from "zod";
import { defineComponent, type ComponentDefinition } from "./component-contract";

const triggerConfigSchema = z.object({
  event: z.enum(["manual", "push", "pull_request", "schedule"]),
  branch: z.string().min(1).max(255),
});

const buildConfigSchema = z.object({
  command: z.string().min(1).max(2_000),
  workingDirectory: z.string().max(500).default("."),
});

const approvalConfigSchema = z.object({
  required: z.boolean().default(true),
  approver: z.string().max(200).optional(),
});

const vpcConfigSchema = z.object({
  cidr: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, "Enter a CIDR IPv4 network."),
  region: z.string().min(1).max(100),
});

const subnetConfigSchema = z.object({
  cidr: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, "Enter a CIDR IPv4 network."),
  availabilityZone: z.string().max(100).optional(),
  public: z.boolean().default(false),
});

export const triggerComponent = defineComponent({
  metadata: {
    id: "workflow.trigger",
    version: "1.0",
    label: "Trigger",
    description: "Defines how a workflow begins.",
    family: "control-flow",
    maturity: "mock",
    inputs: [],
    outputs: [{ id: "next", label: "Next", direction: "output", dataType: "event", required: false, multiple: true }],
    tags: ["workflow", "start"],
  },
  configSchema: triggerConfigSchema,
  defaultConfig: { event: "manual", branch: "main" },
});

export const buildComponent = defineComponent({
  metadata: {
    id: "workflow.build",
    version: "1.0",
    label: "Build",
    description: "Describes a build step; it does not execute commands in this milestone.",
    family: "workflow-action",
    maturity: "mock",
    inputs: [{ id: "source", label: "Source", direction: "input", dataType: "artifact", required: false, multiple: false }],
    outputs: [{ id: "artifact", label: "Artifact", direction: "output", dataType: "artifact", required: false, multiple: true }],
    tags: ["workflow", "build"],
  },
  configSchema: buildConfigSchema,
  defaultConfig: { command: "npm run build", workingDirectory: "." },
});

export const approvalComponent = defineComponent({
  metadata: {
    id: "workflow.approval",
    version: "1.0",
    label: "Approval",
    description: "Represents a human approval gate.",
    family: "control-flow",
    maturity: "design",
    inputs: [{ id: "in", label: "Incoming", direction: "input", dataType: "event", required: true, multiple: false }],
    outputs: [{ id: "approved", label: "Approved", direction: "output", dataType: "event", required: false, multiple: false }],
    tags: ["workflow", "approval", "safety"],
  },
  configSchema: approvalConfigSchema,
  defaultConfig: { required: true, approver: "" },
});

export const vpcComponent = defineComponent({
  metadata: {
    id: "infrastructure.aws.vpc",
    version: "1.0",
    label: "AWS VPC",
    description: "A design-only virtual private cloud resource.",
    family: "infrastructure-resource",
    maturity: "design",
    inputs: [],
    outputs: [{ id: "network", label: "Network", direction: "output", dataType: "resource-reference", required: false, multiple: true }],
    tags: ["aws", "networking"],
  },
  configSchema: vpcConfigSchema,
  defaultConfig: { cidr: "10.0.0.0/16", region: "ap-southeast-1" },
});

export const subnetComponent = defineComponent({
  metadata: {
    id: "infrastructure.aws.subnet",
    version: "1.0",
    label: "Subnet",
    description: "A design-only subnet resource.",
    family: "infrastructure-resource",
    maturity: "design",
    inputs: [{ id: "vpc", label: "VPC", direction: "input", dataType: "resource-reference", required: true, multiple: false }],
    outputs: [{ id: "subnet", label: "Subnet", direction: "output", dataType: "resource-reference", required: false, multiple: true }],
    tags: ["aws", "networking"],
  },
  configSchema: subnetConfigSchema,
  defaultConfig: { cidr: "10.0.1.0/24", public: false },
});

export const componentCatalog = [
  triggerComponent,
  buildComponent,
  approvalComponent,
  vpcComponent,
  subnetComponent,
] as const satisfies readonly ComponentDefinition[];

export function getComponentDefinition(componentId: string): ComponentDefinition | undefined {
  return componentCatalog.find((component) => component.metadata.id === componentId);
}
