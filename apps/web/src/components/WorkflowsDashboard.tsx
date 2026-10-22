import { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Clock3, Copy, GitBranch, Layers3, Plus, Search, Sparkles, Workflow, X } from "lucide-react";
import type { SavedWorkflow, SavedWorkflowVersion } from "../workflow/workflow-types";

type Props = {
  workflows: SavedWorkflow[];
  onCreate: (mode: "blank" | "sample" | "ai") => void;
  onOpen: (workflow: SavedWorkflowVersion) => void;
  onDuplicate: (workflow: SavedWorkflowVersion) => void;
  onDelete: (workflowId: string) => void;
};

export default function WorkflowsDashboard({ workflows, onCreate, onOpen, onDuplicate, onDelete }: Props) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const latest = useMemo(() => workflows.map((workflow) => ({
    workflow,
    version: [...workflow.versions].sort((a, b) => b.version - a.version)[0],
  })).filter((item) => item.version && item.workflow.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.version.savedAt.localeCompare(a.version.savedAt)), [workflows, search]);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <a className="brand" href="#" aria-label="CloudPilot home">
          <span className="brand-mark"><Layers3 size={20} /></span>
          <span>cloudpilot<span className="brand-ai">.ai</span></span>
        </a>
        <div className="dashboard-topbar-center"><span className="status-dot" /> Personal workspace <span className="topbar-divider">/</span> Projects</div>
        <div className="dashboard-topbar-actions"><span className="safe-pill"> <Activity size={13} /> Prototype workspace</span></div>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="sidebar-label">WORKSPACE</div>
          <div className="dashboard-nav active"><Workflow size={17} /> Workflows <span>{workflows.length}</span></div>
          <div className="dashboard-nav muted"><Layers3 size={17} /> Infrastructure <small>Design</small></div>
          <div className="dashboard-sidebar-note"><span className="dashboard-note-icon"><Activity size={16} /></span><b>Build safely</b><p>Design and validate your graphs before any real deployment is enabled.</p></div>
        </aside>
        <section className="dashboard-content">
          <div className="dashboard-breadcrumb">WORKSPACE <span>/</span> OVERVIEW</div>
          <div className="dashboard-heading">
            <div><h1>Workflows</h1><p>Design, organize and validate your deployment pipelines.</p></div>
            <button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New workflow</button>
          </div>
          <div className="dashboard-stats">
            <div className="dashboard-stat"><span className="stat-icon purple"><Workflow size={17} /></span><div><small>Total workflows</small><b>{workflows.length}</b></div></div>
            <div className="dashboard-stat"><span className="stat-icon green"><Activity size={17} /></span><div><small>Ready to review</small><b>{workflows.length}</b></div></div>
            <div className="dashboard-stat"><span className="stat-icon blue"><Layers3 size={17} /></span><div><small>Infrastructure designs</small><b>1 workspace</b></div></div>
          </div>
          <div className="dashboard-section-heading"><div><h2>Your workflows</h2><p>Saved locally in this browser for this prototype.</p></div>
            <label className="dashboard-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workflows…" /></label>
          </div>
          {latest.length > 0 ? (
            <div className="workflow-card-grid">
              {latest.map(({ workflow, version }) => (
                <article className="workflow-card" key={workflow.id}>
                  <div className="workflow-card-top"><span className="workflow-card-icon"><GitBranch size={18} /></span><span className="draft-status"><span /> Draft</span></div>
                  <h3>{workflow.name}</h3><p className="workflow-card-description">{version.nodes.length} steps · {version.edges.length} connections</p>
                  <div className="workflow-card-meta"><span><Clock3 size={13} /> {new Date(version.savedAt).toLocaleDateString()}</span><span>Version {version.version}</span></div>
                  <div className="workflow-card-actions">
                    <button className="button button-primary button-compact" onClick={() => onOpen(version)}>Open workflow <ArrowUpRight size={13} /></button>
                    <button className="dashboard-icon-button" aria-label={`Duplicate ${workflow.name}`} title="Duplicate workflow" onClick={() => onDuplicate(version)}><Copy size={15} /></button>
                    <button className="dashboard-icon-button danger" aria-label={`Delete ${workflow.name}`} title="Delete workflow" onClick={() => { if (window.confirm(`Delete all saved versions of "${workflow.name}" from this browser?`)) onDelete(workflow.id); }}><X size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <div className="empty-art"><div className="empty-art-node"><Workflow size={24} /></div><span /><div className="empty-art-node secondary"><Layers3 size={22} /></div></div>
              <h2>{search ? "No matching workflows" : "Start building your first workflow"}</h2>
              <p>{search ? "Try another search term." : "Create a blank flow, start from a sample pipeline, or prepare a prompt for an AI-generated proposal."}</p>
              {!search && <div className="empty-actions"><button className="button button-primary" onClick={() => onCreate("blank")}><Plus size={15} /> Create workflow</button><button className="button button-secondary" onClick={() => onCreate("ai")}><Sparkles size={15} /> Ask AI to design</button></div>}
            </div>
          )}
          <div className="dashboard-footnote"><span className="status-dot" /> Safe mode is on <span>·</span> Workflow runs are mock-only; no cloud resources are changed.</div>
        </section>
      </div>
      {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
        <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-workflow-title">
          <button className="modal-close" aria-label="Close" onClick={() => setShowCreate(false)}><X size={17} /></button>
          <div className="modal-kicker">NEW WORKFLOW</div><h2 id="create-workflow-title">How would you like to start?</h2><p>Choose a starting point. You can edit every node before saving.</p>
          <button className="create-option" onClick={() => { setShowCreate(false); onCreate("blank"); }}><span className="create-option-icon"><Plus size={19} /></span><span><b>Blank workflow</b><small>Start with an empty canvas and add only what you need.</small></span><ArrowUpRight size={16} /></button>
          <button className="create-option" onClick={() => { setShowCreate(false); onCreate("sample"); }}><span className="create-option-icon sample"><GitBranch size={19} /></span><span><b>Sample CI/CD pipeline</b><small>Start with source, build, tests, approval and mock deployment.</small></span><ArrowUpRight size={16} /></button>
          <button className="create-option" onClick={() => { setShowCreate(false); onCreate("ai"); }}><span className="create-option-icon ai"><Sparkles size={19} /></span><span><b>Ask AI to design</b><small>Describe the outcome and prepare a reviewable proposal draft.</small></span><ArrowUpRight size={16} /></button>
        </section>
      </div>}
    </main>
  );
}
