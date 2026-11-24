import { describe, expect, it } from "vitest";
import { parseSavedWorkflows } from "./storage";

const goodVersion = {
  workflowId: "w1",
  name: "Pipeline",
  version: 1,
  savedAt: "2026-11-24T10:00:00.000Z",
  nodes: [{ id: "t", position: { x: 0, y: 0 }, className: "workflow-node", data: { label: "Start", kind: "trigger", description: "", config: { event: "manual", branch: "main" } } }],
  edges: [{ id: "e1", source: "t", target: "t", animated: true }],
};

describe("parseSavedWorkflows", () => {
  it("returns nothing for empty storage", () => {
    expect(parseSavedWorkflows(null)).toEqual({ workflows: [], skippedVersions: 0, unreadable: false });
  });

  it("flags unreadable data instead of throwing", () => {
    expect(parseSavedWorkflows("{not json").unreadable).toBe(true);
    expect(parseSavedWorkflows('{"a":1}').unreadable).toBe(true);
  });

  it("keeps valid versions and upgrades them to the current canvas style", () => {
    const result = parseSavedWorkflows(JSON.stringify([{ id: "w1", name: "Pipeline", versions: [goodVersion] }]));
    expect(result.skippedVersions).toBe(0);
    expect(result.workflows[0].versions[0].nodes[0]).toMatchObject({ id: "t", position: { x: 0, y: 0 } });
    expect(result.workflows[0].versions[0].edges[0]).toMatchObject({ id: "e1", type: "smoothstep", animated: false });
    expect(result.workflows[0].versions[0].nodes[0].type).toBe("workflow");
  });

  it("drops damaged entries and versions but keeps the rest", () => {
    const badKind = { ...goodVersion, version: 2, nodes: [{ ...goodVersion.nodes[0], data: { ...goodVersion.nodes[0].data, kind: "teleport" } }] };
    const stored = [
      { id: "w1", name: "Pipeline", versions: [goodVersion, badKind, { nonsense: true }] },
      { id: "w2", name: "No versions field" },
    ];
    const result = parseSavedWorkflows(JSON.stringify(stored));
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].versions.map((version) => version.version)).toEqual([1]);
    expect(result.skippedVersions).toBe(3);
  });
});
