import { Cloud, Play, ShieldCheck } from "lucide-react";

type Props = {
  workflowName: string;
  workflowVersion: number;
  isRunning: boolean;
  hasValidationErrors: boolean;
  onRun: () => void;
};

export default function AppHeader({ workflowName, workflowVersion, isRunning, hasValidationErrors, onRun }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href="#" aria-label="CloudPilot home">
        <span className="brand-mark"><Cloud size={20} /></span>
        <span>cloudpilot<span className="brand-ai">.ai</span></span>
      </a>
      <div className="topbar-center"><span className="status-dot" /> Local workspace <span className="topbar-divider">/</span> {workflowName} <span className="topbar-divider">/</span> v{workflowVersion}</div>
      <div className="topbar-actions">
        <span className="safe-pill"><ShieldCheck size={14} /> Safe mode</span>
        <button type="button" className="button button-primary" onClick={onRun} disabled={isRunning || hasValidationErrors}
          title={hasValidationErrors ? "Fix validation issues before running" : "Validate workflow graph (mock only)"}>
          <Play size={15} /> {isRunning ? "Running…" : "Run mock"}
        </button>
      </div>
    </header>
  );
}
