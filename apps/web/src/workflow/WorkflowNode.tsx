import { createContext, memo, useContext, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { WORKFLOW_NODE_TYPE, catalogEntry, nodeAccent, nodeSummary, type WorkflowCanvasNode } from "./editor";
import { describeRange, nodeConnectionLimits } from "./schema";

/** Validation problems keyed by node ID, provided by App so each node can show its own badge. */
export const NodeIssuesContext = createContext<ReadonlyMap<string, string[]>>(new Map());

function WorkflowNodeView({ id, data, selected }: NodeProps<WorkflowCanvasNode>) {
  const issues = useContext(NodeIssuesContext).get(id) ?? [];
  const entry = catalogEntry(data.kind);
  const summary = nodeSummary(data.kind, data.config);
  const limits = nodeConnectionLimits[data.kind];
  const classes = [
    "wf-node",
    selected && "is-selected",
    issues.length > 0 && "has-issues",
    data.importBatchId && "is-imported",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} style={{ "--kind": nodeAccent[data.kind] } as CSSProperties}>
      {limits.inputs.max > 0 && <Handle type="target" position={Position.Left} title={`Incoming: ${describeRange(limits.inputs)}`} aria-label={`Incoming connections: ${describeRange(limits.inputs)}`} />}
      <div className="wf-node-head">
        <span className="wf-node-icon" aria-hidden="true">{entry.icon}</span>
        <span className="wf-node-type">{entry.label}</span>
        <span className="wf-node-spacer" />
        {data.importBatchId && <span className="wf-node-tag">Suggested</span>}
        {issues.length > 0 && (
          <span className="wf-node-issues" title={issues.join("\n")} aria-label={`${issues.length} issue${issues.length === 1 ? "" : "s"}`}>
            !{issues.length > 1 ? issues.length : ""}
          </span>
        )}
      </div>
      <div className="wf-node-name">{data.label.trim() || "Untitled step"}</div>
      <div className={summary.missing ? "wf-node-summary is-missing" : "wf-node-summary"} title={summary.text}>{summary.text}</div>
      {limits.outputs.max > 0 && <Handle type="source" position={Position.Right} title={`Outgoing: ${describeRange(limits.outputs)}`} aria-label={`Outgoing connections: ${describeRange(limits.outputs)}`} />}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeView);

export const nodeTypes = { [WORKFLOW_NODE_TYPE]: WorkflowNode };
