import type {
  DecomposeRequest,
  DecomposeResponse,
  ExpandTaskRequest,
  ExpandTaskResponse,
  ScheduleResponse,
  TaskNode,
  ValidationResult,
} from "../types/task";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail)
    );
  }
  return res.json();
}

export async function decomposeTasks(
  req: DecomposeRequest
): Promise<DecomposeResponse> {
  return request<DecomposeResponse>("/decompose", req);
}

export async function scheduleTasks(
  req: DecomposeRequest
): Promise<ScheduleResponse> {
  return request<ScheduleResponse>("/schedule", req);
}

export async function scheduleFromTasks(
  tasks: TaskNode[],
  sprintDays = 10,
  bufferPercent = 0.2,
  hoursPerWeek = 40
): Promise<ScheduleResponse> {
  return request<ScheduleResponse>(
    `/schedule-from-tasks?sprint_days=${sprintDays}&buffer_percent=${bufferPercent}&hours_per_week=${hoursPerWeek}`,
    tasks
  );
}

export async function validateTasks(
  tasks: TaskNode[]
): Promise<ValidationResult> {
  return request<ValidationResult>("/validate", tasks);
}

export async function expandTask(
  req: ExpandTaskRequest
): Promise<ExpandTaskResponse> {
  return request<ExpandTaskResponse>("/expand-task", req);
}
