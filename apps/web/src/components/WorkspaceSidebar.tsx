import { useRef, type DragEvent } from "react";
import { FileUp, ShieldCheck, Workflow } from "lucide-react";
import type { WorkflowNodeType } from "../workflow/schema";
import { nodeCatalog } from "../workflow/node-config";

type Props = {
  onCreateNode: (kind: WorkflowNodeType) => void;
  onImportScript: (file?: File) => void | Promise<void>;
};

export default function WorkspaceSidebar({ onCreateNode, onImportScript }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  function handleDragStart(event: DragEvent<HTMLButtonElement>, kind: WorkflowNodeType) {
    event.dataTransfer.setData("application/cloudpilot-node", kind);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-label">WORKSPACE</div>
      <button type="button" className="nav-item active"><Workflow size={17} /> Workflow editor</button>
      <button type="button" className="nav-item" onClick={() => fileInput.current?.click()}><FileUp size={17} /> Import deployment file</button>
      <input ref={fileInput} type="file" accept=".bat,.cmd,.ps1,.sh,.yml,.yaml" hidden onChange={(event) => { void onImportScript(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      <div className="sidebar-label node-label">NODE CATALOG</div>
      {nodeCatalog.map((item) => (
        <button key={item.kind} type="button" className="catalog-item" draggable
          onDragStart={(event) => handleDragStart(event, item.kind)}
          onClick={() => onCreateNode(item.kind)}
          title={`Drag ${item.label} onto the canvas, or click to add it`}>
          <span className={`catalog-icon ${item.iconClass}`}>{item.icon}</span>
          <span><b>{item.label}</b><small>{item.description}</small></span>
        </button>
      ))}
      <div className="sidebar-bottom"><ShieldCheck size={16} /><span><b>Safety first</b><small>Imported scripts are never executed.</small></span></div>
    </aside>
  );
}
