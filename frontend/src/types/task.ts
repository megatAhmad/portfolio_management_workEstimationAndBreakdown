export interface TaskNode {
  id: string;
  title: string;
  description: string;
  estimated_hours: number;
  dependencies: string[];
  priority: "low" | "medium" | "high" | "critical";
  children: TaskNode[];
}

export interface TeamMember {
  name: string;
  hours_per_week: number;
}

export type DecomposeMode = "full_project" | "ai_ds_experiment";

export interface DecomposeRequest {
  prompt: string;
  mode: DecomposeMode;
  repo_context?: string | null;
  team_members: TeamMember[];
  hours_per_week_default: number;
  sprint_days: number;
  buffer_percent: number;
}

export interface ExpandTaskRequest {
  task: TaskNode;
  user_context?: string | null;
  mode: DecomposeMode;
}

export interface ExpandTaskResponse {
  parent_id: string;
  subtasks: TaskNode[];
}

export interface DecomposeResponse {
  tasks: TaskNode[];
  total_estimated_hours: number;
  sprint_capacity: number;
  sprints_needed: number;
}

export interface ScheduledTask {
  id: string;
  title: string;
  description: string;
  estimated_hours: number;
  dependencies: string[];
  priority: string;
  start_day: number;
  end_day: number;
  sprint: number;
}

export interface SprintPlan {
  sprint_number: number;
  tasks: ScheduledTask[];
  total_hours: number;
  capacity: number;
}

export interface ScheduleResponse {
  sprints: SprintPlan[];
  total_hours: number;
  total_sprints: number;
  capacity_per_sprint: number;
}

export interface ValidationResult {
  valid: boolean;
  dependency_errors: string[];
  circular_dependency_errors: string[];
  total_estimated_hours: number;
}
