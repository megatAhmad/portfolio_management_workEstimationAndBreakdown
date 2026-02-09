import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";

export default function PromptInput() {
  const {
    prompt,
    setPrompt,
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
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your feature request in natural language...&#10;&#10;Example: Build a user authentication system with OAuth2, email verification, and role-based access control."
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
