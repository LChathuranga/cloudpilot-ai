import { describe, expect, it } from "vitest";
import { defaultNodeConfig, inferNodeType, nodeCatalog, nodeSettings, nodeSummary, suggestNodesFromScript } from "./editor";
import { nodeConfigSchemas, workflowNodeTypes } from "./schema";

describe("node catalog and settings", () => {
  it("covers every node type", () => {
    expect(nodeCatalog.map((item) => item.kind).sort()).toEqual([...workflowNodeTypes].sort());
  });

  it("only offers dropdown values that validation accepts", () => {
    for (const kind of workflowNodeTypes) {
      for (const field of nodeSettings[kind]) {
        for (const option of field.options ?? []) {
          const config = { ...defaultNodeConfig(kind), [field.key]: option.value };
          const result = nodeConfigSchemas[kind].safeParse(config);
          const fieldIssues = result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === field.key);
          expect(fieldIssues, `${kind}.${field.key}=${option.value}`).toEqual([]);
        }
      }
    }
  });
});

describe("script import", () => {
  it("maps the sample deploy script to suggestions with pre-filled settings", () => {
    const script = [
      "#!/bin/bash",
      "# Sample script for testing the CloudPilot import feature.",
      "npm install",
      "npm run build",
      "npm test",
      "npm audit",
      "kubectl apply -f deployment.yaml",
      "curl http://localhost:3000/health",
    ].join("\n");
    const suggestions = suggestNodesFromScript(script);
    expect(suggestions.map((item) => item.kind)).toEqual(["build", "build", "test", "security-scan", "deploy", "health-check"]);
    expect(suggestions[0].config.command).toBe("npm install");
    expect(suggestions[2].config.command).toBe("npm test");
    expect(suggestions[3].config.scanner).toBe("npm-audit");
    expect(suggestions[5].config.url).toBe("http://localhost:3000/health");
  });

  it("does not match words that only contain a keyword", () => {
    expect(inferNodeType("docker pull node:latest")).toBeNull();
    expect(inferNodeType("# testing notes")).toBeNull();
    expect(inferNodeType("echo running tests")).toBeNull();
    expect(inferNodeType("snyk test")).toBe("security-scan");
  });
});

describe("nodeSummary", () => {
  it("shows the key setting with readable option names", () => {
    expect(nodeSummary("trigger", defaultNodeConfig("trigger"))).toEqual({ text: "Manual · main", missing: false });
    expect(nodeSummary("security-scan", defaultNodeConfig("security-scan"))).toEqual({ text: "Trivy · fail at high", missing: false });
    expect(nodeSummary("deploy", { ...defaultNodeConfig("deploy"), target: "api" })).toEqual({ text: "Local / mock · Staging · api", missing: false });
  });

  it("flags a missing required setting", () => {
    expect(nodeSummary("source", defaultNodeConfig("source"))).toEqual({ text: "Repository not set", missing: true });
    expect(nodeSummary("build", { command: "  " })).toEqual({ text: "Command not set", missing: true });
  });
});
