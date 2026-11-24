import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Edge } from "@xyflow/react";
import type { WorkflowNode, WorkflowSnapshot } from "../workflow/workflow-types";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useWorkflowHistory(
  nodes: WorkflowNode[],
  edges: Edge[],
  setNodes: StateSetter<WorkflowNode[]>,
  setEdges: StateSetter<Edge[]>,
  onNotice: (message: string) => void,
) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoStack = useRef<WorkflowSnapshot[]>([]);
  const redoStack = useRef<WorkflowSnapshot[]>([]);
  const lastSnapshot = useRef<WorkflowSnapshot>({ nodes, edges });
  const skipHistoryCapture = useRef(false);

  useEffect(() => {
    const currentSnapshot: WorkflowSnapshot = { nodes, edges };
    if (JSON.stringify(currentSnapshot) === JSON.stringify(lastSnapshot.current)) {
      if (skipHistoryCapture.current) skipHistoryCapture.current = false;
      return;
    }

    if (skipHistoryCapture.current) {
      skipHistoryCapture.current = false;
      lastSnapshot.current = currentSnapshot;
      setCanUndo(undoStack.current.length > 0);
      setCanRedo(redoStack.current.length > 0);
      return;
    }

    undoStack.current.push(lastSnapshot.current);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    lastSnapshot.current = currentSnapshot;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(false);
  }, [nodes, edges]);

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push({ nodes, edges });
    skipHistoryCapture.current = true;
    lastSnapshot.current = previous;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    onNotice("Undid the last workflow change.");
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ nodes, edges });
    skipHistoryCapture.current = true;
    lastSnapshot.current = next;
    setNodes(next.nodes);
    setEdges(next.edges);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    onNotice("Redid the workflow change.");
  }

  function resetTo(snapshot: WorkflowSnapshot) {
    skipHistoryCapture.current = true;
    undoStack.current = [];
    redoStack.current = [];
    lastSnapshot.current = snapshot;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setCanUndo(false);
    setCanRedo(false);
  }

  return { canUndo, canRedo, undo, redo, resetTo };
}
