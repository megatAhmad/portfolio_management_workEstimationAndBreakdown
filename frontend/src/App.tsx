import { useProjectStore } from "./store/useProjectStore";
import PromptInput from "./components/PromptInput";
import TeamSidebar from "./components/TeamSidebar";
import TaskDAG from "./components/TaskDAG";
import GanttView from "./components/GanttView";
import ViewToggle from "./components/ViewToggle";
import "./App.css";

function App() {
  const viewMode = useProjectStore((s) => s.viewMode);
  const error = useProjectStore((s) => s.error);

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI-Ops Task Architect</h1>
        <p className="subtitle">
          Convert feature requests into resource-aware execution plans
        </p>
      </header>

      <div className="app-layout">
        <TeamSidebar />
        <main className="main-content">
          <PromptInput />
          {error && (
            <div className="error-banner">
              <strong>Error:</strong> {error}
            </div>
          )}
          <ViewToggle />
          <div className="view-area">
            {viewMode === "dag" ? <TaskDAG /> : <GanttView />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
