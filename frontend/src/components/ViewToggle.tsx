import { useProjectStore, type ViewMode } from "../store/useProjectStore";

const modes: { key: ViewMode; label: string }[] = [
  { key: "dag", label: "DAG View" },
  { key: "gantt", label: "Gantt View" },
];

export default function ViewToggle() {
  const viewMode = useProjectStore((s) => s.viewMode);
  const setViewMode = useProjectStore((s) => s.setViewMode);

  return (
    <div className="view-toggle">
      {modes.map((m) => (
        <button
          key={m.key}
          className={viewMode === m.key ? "active" : ""}
          onClick={() => setViewMode(m.key)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
