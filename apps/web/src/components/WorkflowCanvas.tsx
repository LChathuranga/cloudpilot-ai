import type { DragEvent } from "react";
import {
  Background, Controls, MiniMap, ReactFlow, ConnectionLineType, MarkerType,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type ReactFlowInstance,
} from "@xyflow/react";
import NodeInspector from "./NodeInspector";
import type { WorkflowNodeData } from "../workflow/workflow-types";

type WorkflowNode = Node<WorkflowNodeData>;

type Props = {
  nodes: WorkflowNode[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onInit: (instance: ReactFlowInstance<WorkflowNode, Edge>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  selectedNode: WorkflowNode | null;
  onSelectNode: (node: WorkflowNode | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, changes: Partial<WorkflowNodeData>) => void;
};

export default function WorkflowCanvas(props: Props) {
  return (
    <div className="flow-canvas" onDragOver={props.onDragOver} onDrop={props.onDrop}>
      <ReactFlow<WorkflowNode, Edge>
        onInit={props.onInit}
        nodes={props.nodes}
        edges={props.edges}
        onNodesChange={props.onNodesChange}
        onEdgesChange={props.onEdgesChange}
        onConnect={props.onConnect}
        nodesConnectable
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: "#6978ed", strokeWidth: 2.5 }}
        defaultEdgeOptions={{ type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed, color: "#6978ed" }, style: { stroke: "#8793d8", strokeWidth: 2 } }}
        onNodeClick={(_, node) => { props.onSelectNode(node); props.onSelectEdge(null); }}
        onEdgeClick={(_, edge) => { props.onSelectEdge(edge.id); props.onSelectNode(null); }}
        onPaneClick={() => { props.onSelectNode(null); props.onSelectEdge(null); }}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background gap={20} size={1} color="#dfe5ee" />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={3} />
      </ReactFlow>
      {props.selectedNode && (
        <NodeInspector
          node={props.selectedNode}
          onClose={() => props.onSelectNode(null)}
          onDelete={props.onDeleteNode}
          onChange={props.onUpdateNode}
        />
      )}
    </div>
  );
}
