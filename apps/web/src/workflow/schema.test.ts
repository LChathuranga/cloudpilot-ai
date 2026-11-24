import { describe, expect, it } from "vitest";
import { checkNewConnection, describeRange, findWorkflowIssues, nodeConnectionLimits, validateWorkflowGraph, workflowNodeTypes, type WorkflowGraph } from "./schema";

type TestNode = WorkflowGraph["nodes"][number];

const trigger: TestNode = { id: "t", type: "trigger", label: "Start", config: { event: "manual", branch: "main" } };
const build: TestNode = { id: "b", type: "build", label: "Build", config: { command: "npm run build" } };
const test: TestNode = { id: "c", type: "test", label: "Test", config: { command: "npm test" } };
const edge = (id: string, source: string, target: string) => ({ id, source, target });
const graph = (nodes: TestNode[], edges: WorkflowGraph["edges"], name = "Pipeline"): WorkflowGraph => ({ id: "w", name, version: 1, nodes, edges });

describe("validateWorkflowGraph", () => {
  it("accepts a connected trigger → build workflow", () => {
    expect(validateWorkflowGraph(graph([trigger, build], [edge("1", "t", "b")]))).toEqual([]);
  });

  it("requires a trigger and at least one action", () => {
    expect(validateWorkflowGraph(graph([], []))).toEqual([
      "Add at least one node before running the workflow.",
      "Add a Trigger node to define how the workflow starts.",
    ]);
    expect(validateWorkflowGraph(graph([trigger], []))).toContain("Add at least one action node after the Trigger.");
  });

  it("names the node and field for missing settings", () => {
    const deploy: TestNode = { id: "d", type: "deploy", label: "Ship", config: { provider: "mock", environment: "staging", target: "" } };
    expect(validateWorkflowGraph(graph([trigger, deploy], [edge("1", "t", "d")]))).toEqual(['Deploy node "Ship" needs a deployment target.']);
  });

  it("reports an empty display name and still runs the other checks", () => {
    const unnamed: TestNode = { ...build, label: "  ", config: { command: "" } };
    const errors = validateWorkflowGraph(graph([trigger, unnamed], [edge("1", "t", "b")], ""));
    expect(errors).toEqual([
      "Give the workflow a name.",
      "Build node #2 (no name) needs a display name.",
      "Build node #2 (no name) needs a build command.",
    ]);
  });

  it("rejects values outside the allowed lists", () => {
    const scan: TestNode = { id: "s", type: "security-scan", label: "Scan", config: { scanner: "unknown", severityThreshold: "high" } };
    const rollback: TestNode = { id: "r", type: "rollback", label: "Undo", config: { strategy: "pray", target: "api" } };
    const errors = validateWorkflowGraph(graph([trigger, scan, rollback], [edge("1", "t", "s"), edge("2", "s", "r")]));
    expect(errors).toEqual(['Security scan node "Scan" needs a supported scanner.', 'Rollback node "Undo" needs a supported rollback strategy.']);
  });

  it("checks health-check status codes and timeouts strictly", () => {
    const health = (expectedStatus: unknown, timeoutSeconds: unknown): TestNode => ({ id: "h", type: "health-check", label: "Health", config: { url: "http://x", expectedStatus, timeoutSeconds } });
    const check = (node: TestNode) => validateWorkflowGraph(graph([trigger, node], [edge("1", "t", "h")]));
    expect(check(health("200", "30"))).toEqual([]);
    expect(check(health(204, 5))).toEqual([]);
    expect(check(health("1e2", "0"))).toEqual([
      'Health check node "Health" needs a valid HTTP status code (100–599).',
      'Health check node "Health" needs a positive timeout in seconds.',
    ]);
    expect(check(health("999", "abc"))).toHaveLength(2);
  });

  it("flags missing connections and nodes that no trigger reaches", () => {
    expect(validateWorkflowGraph(graph([trigger, build], []))).toEqual([
      'Trigger node "Start" needs at least 1 outgoing connection.',
      'Build node "Build" needs at least 1 incoming connection.',
    ]);
    // Test -> Deploy is connected, but nothing links it to the Trigger.
    const deploy: TestNode = { id: "d", type: "deploy", label: "Ship", config: { provider: "mock", environment: "staging", target: "api" } };
    expect(validateWorkflowGraph(graph([trigger, build, test, deploy], [edge("1", "t", "b"), edge("2", "c", "d")]))).toEqual([
      'Test node "Test" needs at least 1 incoming connection.',
      'Deploy node "Ship" is not reachable from a Trigger. Connect it into the workflow.',
    ]);
  });

  it("detects cycles, self-loops, duplicates and missing endpoints", () => {
    expect(validateWorkflowGraph(graph([trigger, build, test], [edge("1", "t", "b"), edge("2", "b", "c"), edge("3", "c", "b")]))).toContain(
      "Workflow contains a cycle. Cycles are not supported in this MVP.",
    );
    expect(validateWorkflowGraph(graph([trigger, build], [edge("1", "t", "b"), edge("2", "b", "b")]))).toContain("Connection 2 cannot loop to the same node.");
    expect(validateWorkflowGraph(graph([trigger, build, test], [edge("1", "t", "b"), edge("1", "b", "c")]))).toContain("Every connection must have a unique ID.");
    expect(validateWorkflowGraph(graph([trigger, build], [edge("1", "t", "b"), edge("2", "t", "b")]))).toContain('Duplicate connection from "t" to "b" is not allowed.');
    expect(validateWorkflowGraph(graph([trigger, build], [edge("1", "t", "b"), edge("2", "b", "zzz")]))).toContain("Connection 2 has a missing target node.");
  });

  it("reports where malformed data is wrong instead of throwing", () => {
    expect(validateWorkflowGraph({ id: "w", name: "x", version: 1, nodes: [{ id: "a", type: "teleport", label: "?" }], edges: [] })[0]).toMatch(/^Invalid workflow data at "nodes\.0\.type"/);
    expect(validateWorkflowGraph(null)[0]).toMatch(/^Invalid workflow data at "root"/);
  });
});

describe("findWorkflowIssues", () => {
  it("ties node problems to the node they belong to", () => {
    const deploy: TestNode = { id: "d", type: "deploy", label: "Ship", config: { provider: "mock", environment: "staging", target: "" } };
    const issues = findWorkflowIssues(graph([trigger, build, deploy], [edge("1", "t", "b")]));
    expect(issues).toEqual([
      { message: 'Deploy node "Ship" needs a deployment target.', nodeId: "d" },
      { message: 'Deploy node "Ship" needs at least 1 incoming connection.', nodeId: "d" },
    ]);
  });

  it("leaves graph-wide problems without a node", () => {
    expect(findWorkflowIssues(graph([], []))).toEqual([
      { message: "Add at least one node before running the workflow.", nodeId: undefined },
      { message: "Add a Trigger node to define how the workflow starts.", nodeId: undefined },
    ]);
  });
});

describe("connection limits", () => {
  const approval: TestNode = { id: "a", type: "approval", label: "Sign-off", config: { required: true } };
  const rollback: TestNode = { id: "r", type: "rollback", label: "Undo", config: { strategy: "manual", target: "api" } };

  it("defines limits for every node type with min never above max", () => {
    for (const type of workflowNodeTypes) {
      const { inputs, outputs } = nodeConnectionLimits[type];
      expect(inputs.min, type).toBeLessThanOrEqual(inputs.max);
      expect(outputs.min, type).toBeLessThanOrEqual(outputs.max);
    }
  });

  it("reports connections beyond a node type's maximum", () => {
    const twoIntoApproval = graph([trigger, build, test, approval], [edge("1", "t", "b"), edge("2", "t", "c"), edge("3", "b", "a"), edge("4", "c", "a")]);
    expect(validateWorkflowGraph(twoIntoApproval)).toContain('Approval node "Sign-off" can have at most 1 incoming connection.');
    expect(validateWorkflowGraph(graph([trigger, rollback, build], [edge("1", "t", "r"), edge("2", "r", "b")]))).toContain('Rollback node "Undo" cannot have outgoing connections.');
    expect(validateWorkflowGraph(graph([trigger, build], [edge("1", "t", "b"), edge("2", "b", "t")]))).toContain('Trigger node "Start" cannot have incoming connections.');
  });

  it("requires an approval to gate a following step", () => {
    expect(validateWorkflowGraph(graph([trigger, approval], [edge("1", "t", "a")]))).toEqual(['Approval node "Sign-off" needs at least 1 outgoing connection.']);
  });

  it("blocks a new connection that would break a limit", () => {
    expect(checkNewConnection({ type: "build", outgoing: 3 }, { type: "test", incoming: 2 })).toBeNull();
    expect(checkNewConnection({ type: "rollback", outgoing: 0 }, { type: "build", incoming: 0 })).toBe("Rollback nodes cannot have outgoing connections.");
    expect(checkNewConnection({ type: "build", outgoing: 0 }, { type: "trigger", incoming: 0 })).toBe("Trigger nodes cannot have incoming connections.");
    expect(checkNewConnection({ type: "build", outgoing: 0 }, { type: "health-check", incoming: 1 })).toBe("Health check nodes can have at most 1 incoming connection.");
  });

  it("describes ranges for dot tooltips", () => {
    expect(describeRange(nodeConnectionLimits.approval.inputs)).toBe("exactly 1");
    expect(describeRange(nodeConnectionLimits.trigger.outputs)).toBe("1 or more");
    expect(describeRange(nodeConnectionLimits.build.outputs)).toBe("any number");
  });
});
