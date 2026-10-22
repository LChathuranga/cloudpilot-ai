import { X, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeType } from "../workflow/schema";
import { nodeSettings } from "../workflow/node-config";
import type { NodeConfig, WorkflowNodeData } from "../workflow/workflow-types";

type Props = {
  node: Node<WorkflowNodeData>;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  onChange: (nodeId: string, changes: Partial<WorkflowNodeData>) => void;
};

export default function NodeInspector({ node, onClose, onDelete, onChange }: Props) {
  const fields = nodeSettings[node.data.kind as WorkflowNodeType];

  function updateConfig(key: string, value: string | boolean) {
    onChange(node.id, { config: { ...node.data.config, [key]: value } as NodeConfig });
  }

  return (
    <aside className="node-inspector">
      <button type="button" className="inspector-close" onClick={onClose} aria-label="Close node inspector"><X size={15} /></button>
      <div className="eyebrow">NODE SETTINGS</div>
      <h3>{node.data.label}</h3>
      <p>{node.data.description}</p>
      <label htmlFor="node-label">Display name</label>
      <input id="node-label" value={node.data.label} onChange={(event) => onChange(node.id, { label: event.target.value })} />
      <div className="settings-divider" />
      <div className="settings-section-title">NODE CONFIGURATION</div>
      {fields.map((field) => {
        const id = `setting-${node.id}-${field.key}`;
        const value = node.data.config[field.key];
        return (
          <div className="setting-field" key={field.key}>
            <label htmlFor={id}>{field.label}</label>
            <small>{field.description}</small>
            {field.input === "checkbox" ? (
              <label className="setting-checkbox"><input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => updateConfig(field.key, event.target.checked)} /> Enabled</label>
            ) : field.input === "select" ? (
              <select id={id} value={String(value ?? "")} onChange={(event) => updateConfig(field.key, event.target.value)}>
                {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.input === "textarea" ? (
              <textarea id={id} rows={3} value={String(value ?? "")} onChange={(event) => updateConfig(field.key, event.target.value)} />
            ) : (
              <input id={id} value={String(value ?? "")} onChange={(event) => updateConfig(field.key, event.target.value)} />
            )}
          </div>
        );
      })}
      <button type="button" className="button button-danger delete-node-button" onClick={() => onDelete(node.id)}><Trash2 size={14} /> Delete node</button>
    </aside>
  );
}
