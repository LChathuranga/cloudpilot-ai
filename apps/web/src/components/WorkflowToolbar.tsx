import { GitBranch, Trash2, X } from "lucide-react";
import type { SavedWorkflow } from "../workflow/workflow-types";

type Props = {
  workflowVersion: number;
  nodeCount: number;
  edgeCount: number;
  savedWorkflows: SavedWorkflow[];
  selectedSavedVersion: string;
  onSelectedSavedVersionChange: (value: string) => void;
  onSave: () => void;
  onOpen: () => void;
  onNew: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedEdgeExists: boolean;
  onDeleteConnection: () => void;
  hasImportedNodes: boolean;
  onRemoveImportedNodes: () => void;
  hasNodes: boolean;
  onClear: () => void;
};

export default function WorkflowToolbar(props: Props) {
  return (
    <div className="canvas-toolbar">
      <div className="canvas-title">
        <GitBranch size={16} /><b>Deployment pipeline</b>
        <span className="version-pill">v{props.workflowVersion}</span>
        <span className="connect-hint">Connect: drag between dots · Remove: click a line, then press Delete or use the button</span>
      </div>
      <div className="canvas-toolbar-actions">
        <button type="button" className="button button-primary button-compact" onClick={props.onSave}>Save workflow</button>
        <select className="saved-version-select" aria-label="Saved workflow versions" value={props.selectedSavedVersion}
          onChange={(event) => props.onSelectedSavedVersionChange(event.target.value)}>
          <option value="">Open saved version…</option>
          {props.savedWorkflows.flatMap((workflow) => workflow.versions.map((version) => ({
            key: `${workflow.id}:${version.version}`,
            label: `${workflow.name} · v${version.version} · ${new Date(version.savedAt).toLocaleString()}`,
          }))).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <button type="button" className="button button-secondary button-compact" onClick={props.onOpen} disabled={!props.selectedSavedVersion}>Open</button>
        <button type="button" className="button button-secondary button-compact" onClick={props.onNew}>New</button>
        <button type="button" className="button button-secondary button-compact" onClick={props.onUndo} disabled={!props.canUndo} title="Undo the last workflow change">Undo</button>
        <button type="button" className="button button-secondary button-compact" onClick={props.onRedo} disabled={!props.canRedo} title="Redo the last undone change">Redo</button>
        {props.selectedEdgeExists && <button type="button" className="button button-danger button-compact" onClick={props.onDeleteConnection}><Trash2 size={13} /> Delete connection</button>}
        {props.hasImportedNodes && <button type="button" className="button button-secondary button-compact" onClick={props.onRemoveImportedNodes}><Trash2 size={13} /> Remove imported nodes</button>}
        {props.hasNodes && <button type="button" className="button button-secondary button-compact" onClick={props.onClear}><X size={13} /> Clear workflow</button>}
        <span className="canvas-meta">{props.nodeCount} nodes <span>·</span> {props.edgeCount} connections</span>
      </div>
    </div>
  );
}
