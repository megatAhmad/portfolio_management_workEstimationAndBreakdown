import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectStore } from "../store/useProjectStore";
import type { TaskNode as TaskNodeType } from "../types/task";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

interface TaskNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  hours: number;
  priority: string;
  taskId: string;
  hasChildren: boolean;
  isExpanding: boolean;
}

function TaskFlowNode({ data }: NodeProps<Node<TaskNodeData>>) {
  const updateTask = useProjectStore((s) => s.updateTask);
  const expandTaskWithAI = useProjectStore((s) => s.expandTaskWithAI);
  const deleteTask = useProjectStore((s) => s.deleteTask);
  const [editing, setEditing] = useState(false);
  const [editHours, setEditHours] = useState(data.hours);
  const [showExpandPrompt, setShowExpandPrompt] = useState(false);
  const [expandContext, setExpandContext] = useState("");

  const handleDoubleClick = () => {
    setEditHours(data.hours);
    setEditing(true);
  };

  const handleSave = () => {
    updateTask(data.taskId, { estimated_hours: editHours });
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  };

  const handleExpand = () => {
    expandTaskWithAI(data.taskId, expandContext || undefined);
    setShowExpandPrompt(false);
    setExpandContext("");
  };

  return (
    <div
      className="task-node"
      style={{ borderLeft: `4px solid ${PRIORITY_COLORS[data.priority] || "#3b82f6"}` }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Top} />
      <div className="task-node-header">
        <div className="task-node-title">{data.label}</div>
        <div className="task-node-actions">
          <button
            className="node-action-btn expand-btn"
            title={data.hasChildren ? "Re-expand with AI" : "Break down with AI"}
            onClick={(e) => {
              e.stopPropagation();
              setShowExpandPrompt(!showExpandPrompt);
            }}
            disabled={data.isExpanding}
          >
            {data.isExpanding ? "..." : data.hasChildren ? "Re" : "+AI"}
          </button>
          <button
            className="node-action-btn delete-btn"
            title="Delete task"
            onClick={(e) => {
              e.stopPropagation();
              deleteTask(data.taskId);
            }}
          >
            x
          </button>
        </div>
      </div>
      <div className="task-node-desc">{data.description}</div>

      {showExpandPrompt && (
        <div className="expand-prompt-area" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="Optional guidance for AI..."
            value={expandContext}
            onChange={(e) => setExpandContext(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleExpand();
              if (e.key === "Escape") setShowExpandPrompt(false);
            }}
            autoFocus
            className="expand-input"
          />
          <div className="expand-actions">
            <button className="btn-tiny primary" onClick={handleExpand}>
              Expand
            </button>
            <button className="btn-tiny" onClick={() => setShowExpandPrompt(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="task-node-hours">
        {editing ? (
          <input
            type="number"
            value={editHours}
            onChange={(e) => setEditHours(Number(e.target.value))}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            min={0}
            step={0.5}
            className="hours-edit"
          />
        ) : (
          <span>{data.hours}h</span>
        )}
        <span className={`priority-badge ${data.priority}`}>{data.priority}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { taskNode: TaskFlowNode };

function flattenToNodesEdges(
  tasks: TaskNodeType[],
  expandingTaskId: string | null,
  xOffset = 0,
  yOffset = 0
): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge[] = [];
  const xSpacing = 280;
  const ySpacing = 160;

  function process(items: TaskNodeType[], depth: number, startX: number) {
    items.forEach((task, i) => {
      const x = startX + i * xSpacing;
      const y = depth * ySpacing + yOffset;
      nodes.push({
        id: task.id,
        type: "taskNode",
        position: { x, y },
        data: {
          label: task.title,
          description:
            task.description.length > 60
              ? task.description.slice(0, 60) + "..."
              : task.description,
          hours: task.estimated_hours,
          priority: task.priority,
          taskId: task.id,
          hasChildren: task.children.length > 0,
          isExpanding: expandingTaskId === task.id,
        },
      });

      for (const depId of task.dependencies) {
        edges.push({
          id: `e-${depId}-${task.id}`,
          source: depId,
          target: task.id,
          animated: true,
          style: { stroke: "#64748b" },
        });
      }

      if (task.children.length > 0) {
        process(task.children, depth + 1, x - ((task.children.length - 1) * xSpacing) / 2);
        for (const child of task.children) {
          const edgeId = `e-${task.id}-${child.id}`;
          if (!edges.find((e) => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: task.id,
              target: child.id,
              style: { stroke: "#94a3b8", strokeDasharray: "5,5" },
            });
          }
        }
      }
    });
  }

  process(tasks, 0, xOffset);
  return { nodes, edges };
}

function AddTaskDialog({
  onAdd,
  onCancel,
  existingIds,
}: {
  onAdd: (task: TaskNodeType) => void;
  onCancel: () => void;
  existingIds: string[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState(4);
  const [priority, setPriority] = useState<TaskNodeType["priority"]>("medium");
  const [depInput, setDepInput] = useState("");

  const nextId = String(
    Math.max(0, ...existingIds.map((id) => Number(id.split(".")[0]) || 0)) + 1
  );

  const handleSubmit = () => {
    if (!title.trim()) return;
    const deps = depInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onAdd({
      id: nextId,
      title: title.trim(),
      description: description.trim(),
      estimated_hours: hours,
      dependencies: deps,
      priority,
      children: [],
    });
  };

  return (
    <div className="add-task-dialog">
      <h4>Add New Task</h4>
      <div className="dialog-field">
        <label>ID</label>
        <input type="text" value={nextId} disabled />
      </div>
      <div className="dialog-field">
        <label>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          autoFocus
        />
      </div>
      <div className="dialog-field">
        <label>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description"
        />
      </div>
      <div className="dialog-row">
        <div className="dialog-field">
          <label>Hours</label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            min={0}
            step={0.5}
          />
        </div>
        <div className="dialog-field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TaskNodeType["priority"])}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="dialog-field">
        <label>Dependencies (comma-separated IDs)</label>
        <input
          type="text"
          value={depInput}
          onChange={(e) => setDepInput(e.target.value)}
          placeholder="e.g. 1, 2.1"
        />
      </div>
      <div className="dialog-actions">
        <button className="btn-small" onClick={onCancel}>Cancel</button>
        <button className="btn-primary btn-sm" onClick={handleSubmit} disabled={!title.trim()}>
          Add Task
        </button>
      </div>
    </div>
  );
}

function collectIds(tasks: TaskNodeType[]): string[] {
  const ids: string[] = [];
  for (const t of tasks) {
    ids.push(t.id);
    if (t.children.length > 0) ids.push(...collectIds(t.children));
  }
  return ids;
}

export default function TaskDAG() {
  const tasks = useProjectStore((s) => s.tasks);
  const addDependency = useProjectStore((s) => s.addDependency);
  const removeDependency = useProjectStore((s) => s.removeDependency);
  const deleteTask = useProjectStore((s) => s.deleteTask);
  const validateGraph = useProjectStore((s) => s.validateGraph);
  const validation = useProjectStore((s) => s.validation);
  const addTask = useProjectStore((s) => s.addTask);
  const expandingTaskId = useProjectStore((s) => s.expandingTaskId);

  const [showAddDialog, setShowAddDialog] = useState(false);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => flattenToNodesEdges(tasks, expandingTaskId, 100, 50),
    [tasks, expandingTaskId]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addDependency(connection.target, connection.source);
        setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
      }
    },
    [addDependency, setEdges]
  );

  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      removeDependency(edge.target, edge.source);
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [removeDependency, setEdges]
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      if (confirm(`Delete task "${node.data.label}"?`)) {
        deleteTask(node.id);
      }
    },
    [deleteTask]
  );

  const handleAddTask = (task: TaskNodeType) => {
    addTask(task);
    setShowAddDialog(false);
  };

  if (tasks.length === 0) {
    return (
      <div className="dag-empty">
        <p>No tasks yet. Enter a feature request and click "Decompose Tasks" to generate a task graph.</p>
      </div>
    );
  }

  return (
    <div className="dag-container">
      <div className="dag-toolbar">
        <button onClick={() => setShowAddDialog(!showAddDialog)} className="btn-small">
          + Add Task
        </button>
        <button onClick={() => validateGraph()} className="btn-small">
          Validate
        </button>
        {validation && (
          <span className={`validation-badge ${validation.valid ? "valid" : "invalid"}`}>
            {validation.valid
              ? `Valid — ${validation.total_estimated_hours}h total`
              : `${validation.dependency_errors.length + validation.circular_dependency_errors.length} error(s)`}
          </span>
        )}
        <span className="dag-hint">
          Drag handles to connect. Double-click edges to disconnect. Click +AI on nodes to expand.
        </span>
      </div>

      {showAddDialog && (
        <div className="dialog-overlay">
          <AddTaskDialog
            onAdd={handleAddTask}
            onCancel={() => setShowAddDialog(false)}
            existingIds={collectIds(tasks)}
          />
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
