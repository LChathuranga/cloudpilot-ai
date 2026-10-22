import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkflowGraph, validateInfrastructureGraph } from "../.test-dist/graph-core.js";
import { buildComponent, vpcComponent } from "../.test-dist/catalog.js";
import { validateComponentConfig, validatePortConnection } from "../.test-dist/component-contract.js";

const validWorkflow = {
  id: "workflow-ci",
  name: "CI",
  version: 1,
  nodes: [
    { id: "trigger", type: "trigger", label: "Trigger", config: {} },
    { id: "build", type: "build", label: "Build", config: { command: "npm run build" } },
  ],
  edges: [{ id: "edge-trigger-build", source: "trigger", target: "build" }],
};

test("accepts a valid workflow graph and applies schema defaults", () => {
  const result = validateWorkflowGraph(validWorkflow);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("rejects workflow edges with missing endpoints", () => {
  const result = validateWorkflowGraph({
    ...validWorkflow,
    edges: [{ id: "broken", source: "trigger", target: "missing" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-endpoint"));
});

test("rejects unsupported workflow cycles", () => {
  const result = validateWorkflowGraph({
    ...validWorkflow,
    edges: [
      { id: "one", source: "trigger", target: "build" },
      { id: "two", source: "build", target: "trigger" },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "cycle"));
});

test("rejects infrastructure relationships with missing resources", () => {
  const result = validateInfrastructureGraph({
    id: "infra",
    name: "Demo",
    version: 1,
    resources: [
      { id: "vpc", componentId: "infrastructure.aws.vpc", label: "VPC", provider: "aws", config: { cidr: "10.0.0.0/16", region: "ap-southeast-1" } },
    ],
    relationships: [
      { id: "subnet-in-vpc", source: "subnet", target: "vpc", relationship: "contains" },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-endpoint"));
});

test("accepts a valid infrastructure graph", () => {
  const result = validateInfrastructureGraph({
    id: "infra",
    name: "Demo",
    version: 1,
    resources: [
      { id: "vpc", componentId: "infrastructure.aws.vpc", label: "VPC", provider: "aws", config: {} },
      { id: "subnet", componentId: "infrastructure.aws.subnet", label: "Subnet", provider: "aws", config: { cidr: "10.0.1.0/24", public: false } },
    ],
    relationships: [
      { id: "contains-subnet", source: "vpc", target: "subnet", relationship: "contains" },
    ],
  });
  assert.equal(result.valid, true);
});

test("component config validation returns actionable paths", () => {
  const result = validateComponentConfig(buildComponent, { command: "" });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.errors.some((message) => message.includes("command")));
});

test("catalog defaults satisfy their component schemas", () => {
  assert.equal(validateComponentConfig(vpcComponent, vpcComponent.defaultConfig).success, true);
});

test("typed ports reject incompatible data types", () => {
  const result = validatePortConnection(
    { id: "artifact", label: "Artifact", direction: "output", dataType: "artifact", required: false, multiple: true },
    { id: "url", label: "URL", direction: "input", dataType: "string", required: true, multiple: false },
  );
  assert.equal(result.compatible, false);
  assert.match(result.message ?? "", /type mismatch/i);
});

test("typed ports accept compatible output-to-input connections", () => {
  const result = validatePortConnection(
    { id: "artifact", label: "Artifact", direction: "output", dataType: "artifact", required: false, multiple: true },
    { id: "source", label: "Source", direction: "input", dataType: "artifact", required: false, multiple: false },
  );
  assert.equal(result.compatible, true);
});

test("rejects unsupported infrastructure components and invalid configuration", () => {
  const result = validateInfrastructureGraph({
    id: "infra",
    name: "Invalid",
    version: 1,
    resources: [
      { id: "vpc", componentId: "infrastructure.aws.vpc", label: "VPC", provider: "aws", config: { cidr: "bad", region: "" } },
      { id: "mystery", componentId: "infrastructure.aws.unknown", label: "Unknown", provider: "aws", config: {} },
    ],
    relationships: [],
  });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "invalid-config"));
  assert.ok(result.issues.some((issue) => issue.code === "unknown-component"));
});
