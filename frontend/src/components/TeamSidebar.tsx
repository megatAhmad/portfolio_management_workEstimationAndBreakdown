import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";

export default function TeamSidebar() {
  const {
    teamMembers,
    addTeamMember,
    removeTeamMember,
    sprintDays,
    setSprintDays,
    bufferPercent,
    setBufferPercent,
    hoursPerWeekDefault,
    setHoursPerWeekDefault,
    totalHours,
    sprintCapacity,
    sprintsNeeded,
    tasks,
  } = useProjectStore();

  const [name, setName] = useState("");
  const [hours, setHours] = useState(40);

  const handleAdd = () => {
    if (name.trim()) {
      addTeamMember({ name: name.trim(), hours_per_week: hours });
      setName("");
      setHours(40);
    }
  };

  return (
    <aside className="team-sidebar">
      <h3>Team &amp; Sprint Config</h3>

      <div className="config-section">
        <label>
          Sprint Length (days)
          <input
            type="number"
            min={1}
            value={sprintDays}
            onChange={(e) => setSprintDays(Number(e.target.value))}
          />
        </label>

        <label>
          Buffer (%)
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(bufferPercent * 100)}
            onChange={(e) => setBufferPercent(Number(e.target.value) / 100)}
          />
        </label>

        <label>
          Default Hours/Week
          <input
            type="number"
            min={1}
            value={hoursPerWeekDefault}
            onChange={(e) => setHoursPerWeekDefault(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="config-section">
        <h4>Team Members</h4>
        {teamMembers.length === 0 && (
          <p className="hint">No members added. Using default hours.</p>
        )}
        <ul className="member-list">
          {teamMembers.map((m, i) => (
            <li key={i}>
              <span>
                {m.name} — {m.hours_per_week}h/week
              </span>
              <button onClick={() => removeTeamMember(i)} className="btn-remove">
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="add-member">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            style={{ width: 70 }}
          />
          <button onClick={handleAdd} className="btn-small">
            Add
          </button>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="config-section summary">
          <h4>Summary</h4>
          <p>Total Hours: <strong>{totalHours.toFixed(1)}</strong></p>
          <p>Sprint Capacity: <strong>{sprintCapacity.toFixed(1)}h</strong></p>
          <p>Sprints Needed: <strong>{sprintsNeeded}</strong></p>
        </div>
      )}
    </aside>
  );
}
