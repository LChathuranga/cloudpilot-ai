import { ArrowRight, Bot } from "lucide-react";

type Props = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
};

export default function WorkflowPrompt({ prompt, onPromptChange, onSubmit }: Props) {
  return (
    <form className="prompt-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="prompt-icon"><Bot size={19} /></div>
      <div className="prompt-input-wrap">
        <label htmlFor="workflow-prompt">Tell CloudPilot what you want to deploy</label>
        <input id="workflow-prompt" value={prompt} onChange={(event) => onPromptChange(event.target.value)}
          placeholder="e.g. Build my Node app, run tests, scan it, then deploy…" />
        <small>AI generation is planned next. No AI-generated commands are executed.</small>
      </div>
      <button className="button button-primary prompt-submit" type="submit">Draft flow <ArrowRight size={15} /></button>
    </form>
  );
}
