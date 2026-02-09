import { useEffect, useRef, useMemo } from "react";
import Gantt from "frappe-gantt";
import { useProjectStore } from "../store/useProjectStore";

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function GanttView() {
  const schedule = useProjectStore((s) => s.schedule);
  const tasks = useProjectStore((s) => s.tasks);
  const computeSchedule = useProjectStore((s) => s.computeSchedule);
  const loading = useProjectStore((s) => s.loading);
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<Gantt | null>(null);

  const ganttTasks = useMemo(() => {
    if (!schedule) return [];
    const projectStart = new Date();
    return schedule.sprints.flatMap((sprint) =>
      sprint.tasks.map((task) => ({
        id: task.id,
        name: `[S${task.sprint}] ${task.title}`,
        start: formatDate(addBusinessDays(projectStart, task.start_day - 1)),
        end: formatDate(addBusinessDays(projectStart, task.end_day)),
        progress: 0,
        dependencies: task.dependencies.join(", "),
        custom_class: `priority-${task.priority}`,
      }))
    );
  }, [schedule]);

  useEffect(() => {
    if (!containerRef.current || ganttTasks.length === 0) return;

    // Clear previous chart
    containerRef.current.innerHTML = "";

    ganttRef.current = new Gantt(containerRef.current, ganttTasks, {
      view_mode: "Day",
      bar_height: 28,
      padding: 16,
      date_format: "YYYY-MM-DD",
    });

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [ganttTasks]);

  if (tasks.length === 0) {
    return (
      <div className="gantt-empty">
        <p>Generate tasks first to see the Gantt chart.</p>
      </div>
    );
  }

  return (
    <div className="gantt-container">
      <div className="gantt-toolbar">
        <button
          onClick={() => computeSchedule()}
          className="btn-primary"
          disabled={loading || tasks.length === 0}
        >
          {loading ? "Computing..." : "Generate Schedule"}
        </button>
        {schedule && (
          <div className="schedule-summary">
            <span>Total: {schedule.total_hours}h</span>
            <span>Sprints: {schedule.total_sprints}</span>
            <span>Capacity/Sprint: {schedule.capacity_per_sprint.toFixed(1)}h</span>
          </div>
        )}
      </div>
      {schedule ? (
        <div className="gantt-chart" ref={containerRef} />
      ) : (
        <div className="gantt-empty">
          <p>Click "Generate Schedule" to create a Gantt timeline from your tasks.</p>
        </div>
      )}

      {schedule && (
        <div className="sprint-breakdown">
          <h3>Sprint Breakdown</h3>
          {schedule.sprints.map((sprint) => (
            <div key={sprint.sprint_number} className="sprint-card">
              <h4>
                Sprint {sprint.sprint_number}
                <span className="sprint-usage">
                  {sprint.total_hours.toFixed(1)}h / {sprint.capacity.toFixed(1)}h
                  ({((sprint.total_hours / sprint.capacity) * 100).toFixed(0)}%)
                </span>
              </h4>
              <div className="capacity-bar">
                <div
                  className="capacity-fill"
                  style={{
                    width: `${Math.min(100, (sprint.total_hours / sprint.capacity) * 100)}%`,
                  }}
                />
              </div>
              <ul>
                {sprint.tasks.map((t) => (
                  <li key={t.id}>
                    <span className={`priority-dot ${t.priority}`} />
                    {t.title} — {t.estimated_hours}h
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
