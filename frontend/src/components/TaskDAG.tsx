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
}

function TaskFlowNode({ data }: NodeProps<Node<TaskNodeData>>) {
  const updateTask = useProjectStore((s) => s.updateTask);
  const [editing, setEditing] = useState(false);
  const [editHours, setEditHours] = useState(data.hours);

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

  return (
    <div
      className="task-node"
      style={{ borderLeft: `4px solid ${PRIORITY_COLORS[data.priority] || "#3b82f6"}` }}
      onDoubleClick={handleDoubleClick}
    >
      <Handle type="target" position={Position.Top} />
      <div className="task-node-title">{data.label}</div>
      <div className="task-node-desc">{data.description}</div>
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
        // Add implicit parent->child edges
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

export default function TaskDAG() {
  const tasks = useProjectStore((s) => s.tasks);
  const addDependency = useProjectStore((s) => s.addDependency);
  const removeDependency = useProjectStore((s) => s.removeDependency);
  const deleteTask = useProjectStore((s) => s.deleteTask);
  const validateGraph = useProjectStore((s) => s.validateGraph);
  const validation = useProjectStore((s) => s.validation);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => flattenToNodesEdges(tasks, 100, 50),
    [tasks]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when tasks change externally
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
        <button onClick={() => validateGraph()} className="btn-small">
          Validate Graph
        </button>
        {validation && (
          <span className={`validation-badge ${validation.valid ? "valid" : "invalid"}`}>
            {validation.valid
              ? `Valid — ${validation.total_estimated_hours}h total`
              : `${validation.dependency_errors.length + validation.circular_dependency_errors.length} error(s)`}
          </span>
        )}
        <span className="dag-hint">
          Drag between handles to create dependencies. Double-click edges to remove. Right-click nodes to delete. Double-click nodes to edit hours.
        </span>
      </div>
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
