import { create } from "zustand";
import type {
  DecomposeRequest,
  ScheduleResponse,
  TaskNode,
  TeamMember,
  ValidationResult,
} from "../types/task";
import {
  decomposeTasks,
  scheduleFromTasks,
  validateTasks,
} from "../api/client";

export type ViewMode = "dag" | "gantt";

interface ProjectState {
  // Input state
  prompt: string;
  repoContext: string;
  teamMembers: TeamMember[];
  sprintDays: number;
  bufferPercent: number;
  hoursPerWeekDefault: number;

  // Output state
  tasks: TaskNode[];
  schedule: ScheduleResponse | null;
  validation: ValidationResult | null;
  totalHours: number;
  sprintCapacity: number;
  sprintsNeeded: number;

  // UI state
  viewMode: ViewMode;
  loading: boolean;
  error: string | null;

  // Actions
  setPrompt: (prompt: string) => void;
  setRepoContext: (ctx: string) => void;
  setTeamMembers: (members: TeamMember[]) => void;
  addTeamMember: (member: TeamMember) => void;
  removeTeamMember: (index: number) => void;
  setSprintDays: (days: number) => void;
  setBufferPercent: (pct: number) => void;
  setHoursPerWeekDefault: (hours: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setTasks: (tasks: TaskNode[]) => void;
  updateTask: (taskId: string, updates: Partial<TaskNode>) => void;
  addDependency: (fromId: string, toId: string) => void;
  removeDependency: (fromId: string, toId: string) => void;
  deleteTask: (taskId: string) => void;
  generateTasks: () => Promise<void>;
  computeSchedule: () => Promise<void>;
  validateGraph: () => Promise<void>;
}

function updateTaskInTree(
  tasks: TaskNode[],
  taskId: string,
  updates: Partial<TaskNode>
): TaskNode[] {
  return tasks.map((t) => {
    if (t.id === taskId) {
      return { ...t, ...updates };
    }
    if (t.children.length > 0) {
      return { ...t, children: updateTaskInTree(t.children, taskId, updates) };
    }
    return t;
  });
}

function deleteTaskFromTree(tasks: TaskNode[], taskId: string): TaskNode[] {
  return tasks
    .filter((t) => t.id !== taskId)
    .map((t) => ({
      ...t,
      children: deleteTaskFromTree(t.children, taskId),
      dependencies: t.dependencies.filter((d) => d !== taskId),
    }));
}

function addDepInTree(
  tasks: TaskNode[],
  fromId: string,
  toId: string
): TaskNode[] {
  return tasks.map((t) => {
    if (t.id === fromId && !t.dependencies.includes(toId)) {
      return { ...t, dependencies: [...t.dependencies, toId] };
    }
    if (t.children.length > 0) {
      return { ...t, children: addDepInTree(t.children, fromId, toId) };
    }
    return t;
  });
}

function removeDepInTree(
  tasks: TaskNode[],
  fromId: string,
  toId: string
): TaskNode[] {
  return tasks.map((t) => {
    if (t.id === fromId) {
      return { ...t, dependencies: t.dependencies.filter((d) => d !== toId) };
    }
    if (t.children.length > 0) {
      return { ...t, children: removeDepInTree(t.children, fromId, toId) };
    }
    return t;
  });
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Input defaults
  prompt: "",
  repoContext: "",
  teamMembers: [],
  sprintDays: 10,
  bufferPercent: 0.2,
  hoursPerWeekDefault: 40,

  // Output defaults
  tasks: [],
  schedule: null,
  validation: null,
  totalHours: 0,
  sprintCapacity: 0,
  sprintsNeeded: 0,

  // UI defaults
  viewMode: "dag",
  loading: false,
  error: null,

  // Setters
  setPrompt: (prompt) => set({ prompt }),
  setRepoContext: (repoContext) => set({ repoContext }),
  setTeamMembers: (teamMembers) => set({ teamMembers }),
  addTeamMember: (member) =>
    set((s) => ({ teamMembers: [...s.teamMembers, member] })),
  removeTeamMember: (index) =>
    set((s) => ({
      teamMembers: s.teamMembers.filter((_, i) => i !== index),
    })),
  setSprintDays: (sprintDays) => set({ sprintDays }),
  setBufferPercent: (bufferPercent) => set({ bufferPercent }),
  setHoursPerWeekDefault: (hoursPerWeekDefault) => set({ hoursPerWeekDefault }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTasks: (tasks) => set({ tasks }),

  updateTask: (taskId, updates) =>
    set((s) => ({ tasks: updateTaskInTree(s.tasks, taskId, updates) })),

  addDependency: (fromId, toId) =>
    set((s) => ({ tasks: addDepInTree(s.tasks, fromId, toId) })),

  removeDependency: (fromId, toId) =>
    set((s) => ({ tasks: removeDepInTree(s.tasks, fromId, toId) })),

  deleteTask: (taskId) =>
    set((s) => ({ tasks: deleteTaskFromTree(s.tasks, taskId) })),

  generateTasks: async () => {
    const state = get();
    set({ loading: true, error: null });
    try {
      const req: DecomposeRequest = {
        prompt: state.prompt,
        repo_context: state.repoContext || null,
        team_members: state.teamMembers,
        hours_per_week_default: state.hoursPerWeekDefault,
        sprint_days: state.sprintDays,
        buffer_percent: state.bufferPercent,
      };
      const resp = await decomposeTasks(req);
      set({
        tasks: resp.tasks,
        totalHours: resp.total_estimated_hours,
        sprintCapacity: resp.sprint_capacity,
        sprintsNeeded: resp.sprints_needed,
        loading: false,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  computeSchedule: async () => {
    const state = get();
    set({ loading: true, error: null });
    try {
      const schedule = await scheduleFromTasks(
        state.tasks,
        state.sprintDays,
        state.bufferPercent,
        state.hoursPerWeekDefault
      );
      set({ schedule, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  validateGraph: async () => {
    const state = get();
    try {
      const validation = await validateTasks(state.tasks);
      set({ validation });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));
