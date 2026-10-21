import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkflow } from "./validate.js";

const validGraph = () => ({
  id: "workflow-test",
  name: "Test workflow",
  version: 1,
  nodes: [
    { id: "trigger", type: "trigger" as const, label: "Trigger", config: { event: "manual", branch: "main" } },
    { id: "build", type: "build" as const, label: "Build", config: { command: "npm run build" } }
  ],
  edges: [{ id: "edge-1", source: "trigger", target: "build" }]
});

test("accepts a connected, configured workflow", () => {
  const result = validateWorkflow(validGraph());
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("rejects a build node that is missing its command", () => {
  const graph = validGraph();
  graph.nodes[1].config = {};
  const result = validateWorkflow(graph);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "BUILD_COMMAND_REQUIRED"));
});

test("rejects nodes unreachable from a trigger", () => {
  const graph = validGraph();
  graph.nodes.push({ id: "test", type: "test", label: "Test", config: { command: "npm test" } });
  const result = validateWorkflow(graph);
  assert.ok(result.issues.some((issue) => issue.code === "NODE_UNREACHABLE" && issue.nodeId === "test"));
});

test("rejects directed cycles", () => {
  const graph = validGraph();
  graph.edges.push({ id: "edge-2", source: "build", target: "trigger" });
  const result = validateWorkflow(graph);
  assert.ok(result.issues.some((issue) => issue.code === "WORKFLOW_CYCLE"));
});

test("rejects malformed graph schema", () => {
  const result = validateWorkflow({ id: "bad", name: "", version: 0, nodes: [], edges: [] });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "SCHEMA_INVALID"));
});
