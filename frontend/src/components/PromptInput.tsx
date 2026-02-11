import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { DecomposeMode } from "../types/task";

const MODE_OPTIONS: { key: DecomposeMode; label: string; desc: string }[] = [
  {
    key: "full_project",
    label: "Full Digital Project",
    desc: "End-to-end: backend, frontend, auth, DB, CI/CD, testing, deployment",
  },
  {
    key: "ai_ds_experiment",
    label: "AI / Data Science PoC",
    desc: "Focused: EDA, preprocessing, modelling, evaluation, notebook write-up",
  },
];

export default function PromptInput() {
  const {
    prompt,
    setPrompt,
    mode,
    setMode,
    repoContext,
    setRepoContext,
    generateTasks,
    loading,
  } = useProjectStore();

  const [showContext, setShowContext] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      generateTasks();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="prompt-input">
      <h2>Feature Request</h2>

      <div className="mode-selector">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`mode-card ${mode === opt.key ? "active" : ""}`}
            onClick={() => setMode(opt.key)}
          >
            <span className="mode-label">{opt.label}</span>
            <span className="mode-desc">{opt.desc}</span>
          </button>
        ))}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          mode === "ai_ds_experiment"
            ? "Describe your AI/ML experiment...\n\nExample: Build a churn prediction model using customer transaction data with gradient boosting and SHAP explanations."
            : "Describe your feature request in natural language...\n\nExample: Build a user authentication system with OAuth2, email verification, and role-based access control."
        }
        rows={5}
        disabled={loading}
      />

      <button
        type="button"
        className="toggle-context"
        onClick={() => setShowContext(!showContext)}
      >
        {showContext ? "Hide" : "Show"} Repository Context
      </button>

      {showContext && (
        <textarea
          value={repoContext}
          onChange={(e) => setRepoContext(e.target.value)}
          placeholder="Paste a GitHub/GitLab URL or directory file listing for context..."
          rows={3}
          disabled={loading}
          className="context-input"
        />
      )}

      <button type="submit" className="btn-primary" disabled={loading || !prompt.trim()}>
        {loading ? "Generating..." : "Decompose Tasks"}
      </button>
    </form>
  );
}
