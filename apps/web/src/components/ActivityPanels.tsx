import { Activity, CheckCircle2, Play } from "lucide-react";

type Props = { errors: string[]; notice: string };

export default function ActivityPanels({ errors, notice }: Props) {
  return (
    <div className="bottom-panels">
      <section className="status-panel">
        <div className="panel-heading"><Activity size={16} /><b>Activity &amp; validation</b>
          <span className={errors.length ? "issue-count" : "success-count"}>{errors.length ? `${errors.length} issues` : "No issues"}</span>
        </div>
        {errors.length ? errors.map((error) => <p className="validation-error" key={error}>{error}</p>)
          : <p className="status-message"><CheckCircle2 size={15} /> {notice}</p>}
      </section>
      <section className="run-panel">
        <div className="panel-heading"><Play size={15} /><b>Execution</b><span className="mock-pill">MOCK ONLY</span></div>
        <p>{errors.length
          ? "Fix the validation issues before Run mock becomes available. Saving drafts is still allowed."
          : "Workflow passed validation. Run mock checks the graph only; it does not run shell commands or provision infrastructure."} Saved versions stay in this browser on this device.</p>
      </section>
    </div>
  );
}
