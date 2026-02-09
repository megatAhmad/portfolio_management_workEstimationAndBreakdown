from __future__ import annotations

import math

from app.models.task import (
    DecomposeRequest,
    ScheduledTask,
    ScheduleResponse,
    SprintPlan,
    TaskNode,
)


PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _flatten_tasks(nodes: list[TaskNode], parent_id: str = "") -> list[TaskNode]:
    """Flatten a hierarchical task tree into a list, preserving dependency info."""
    flat: list[TaskNode] = []
    for node in nodes:
        flat.append(
            TaskNode(
                id=node.id,
                title=node.title,
                description=node.description,
                estimated_hours=node.estimated_hours,
                dependencies=node.dependencies,
                priority=node.priority,
                children=[],
            )
        )
        if node.children:
            child_tasks = _flatten_tasks(node.children, node.id)
            flat.extend(child_tasks)
    return flat


def _topological_sort(tasks: list[TaskNode]) -> list[TaskNode]:
    """Sort tasks respecting dependencies (topological order), breaking ties by priority."""
    task_map = {t.id: t for t in tasks}
    valid_ids = set(task_map.keys())
    visited: set[str] = set()
    result: list[TaskNode] = []

    def visit(task_id: str, stack: set[str]) -> None:
        if task_id in visited:
            return
        if task_id in stack:
            raise ValueError(f"Circular dependency detected involving task '{task_id}'")
        stack.add(task_id)
        task = task_map[task_id]
        for dep_id in task.dependencies:
            if dep_id in valid_ids:
                visit(dep_id, stack)
        stack.discard(task_id)
        visited.add(task_id)
        result.append(task)

    # Process by priority so that higher-priority tasks come first when possible
    sorted_ids = sorted(
        task_map.keys(), key=lambda tid: PRIORITY_ORDER.get(task_map[tid].priority, 2)
    )
    for task_id in sorted_ids:
        visit(task_id, set())

    return result


def compute_schedule(
    tasks: list[TaskNode], req: DecomposeRequest
) -> ScheduleResponse:
    """Assign tasks to sprints respecting dependencies and capacity constraints."""
    flat = _flatten_tasks(tasks)
    sorted_tasks = _topological_sort(flat)

    # Capacity calculation
    team_size = len(req.team_members) if req.team_members else 1
    total_hours_per_member = sum(
        m.hours_per_week for m in req.team_members
    ) if req.team_members else req.hours_per_week_default
    # Hours per sprint = total team hours/week * (sprint_days / 5 work days per week)
    hours_per_sprint = total_hours_per_member * (req.sprint_days / 5.0)
    capacity = hours_per_sprint * (1 - req.buffer_percent)

    sprints: list[SprintPlan] = []
    current_sprint_tasks: list[ScheduledTask] = []
    current_sprint_hours = 0.0
    sprint_number = 1
    day_cursor = 0

    # Track which sprint each task lands in, for dependency ordering
    task_sprint_map: dict[str, int] = {}

    for task in sorted_tasks:
        # Check if any dependency is in a later sprint — if so, push to next sprint
        min_sprint = 1
        for dep_id in task.dependencies:
            if dep_id in task_sprint_map:
                min_sprint = max(min_sprint, task_sprint_map[dep_id])

        # If adding this task would exceed capacity, start a new sprint
        if (
            current_sprint_hours + task.estimated_hours > capacity
            and current_sprint_tasks
        ) or sprint_number < min_sprint:
            sprints.append(
                SprintPlan(
                    sprint_number=sprint_number,
                    tasks=current_sprint_tasks,
                    total_hours=current_sprint_hours,
                    capacity=capacity,
                )
            )
            sprint_number += 1
            current_sprint_tasks = []
            current_sprint_hours = 0.0
            day_cursor = 0

        # Ensure we're at least in the min_sprint
        while sprint_number < min_sprint:
            sprints.append(
                SprintPlan(
                    sprint_number=sprint_number,
                    tasks=[],
                    total_hours=0.0,
                    capacity=capacity,
                )
            )
            sprint_number += 1

        # Calculate days for this task (assuming 8h/day)
        hours_per_day = 8.0 if team_size <= 1 else 8.0 * team_size
        task_days = max(1, math.ceil(task.estimated_hours / hours_per_day))
        start_day = day_cursor + 1
        end_day = day_cursor + task_days
        day_cursor = end_day

        scheduled = ScheduledTask(
            id=task.id,
            title=task.title,
            description=task.description,
            estimated_hours=task.estimated_hours,
            dependencies=task.dependencies,
            priority=task.priority,
            start_day=start_day + (sprint_number - 1) * req.sprint_days,
            end_day=end_day + (sprint_number - 1) * req.sprint_days,
            sprint=sprint_number,
        )
        current_sprint_tasks.append(scheduled)
        current_sprint_hours += task.estimated_hours
        task_sprint_map[task.id] = sprint_number

    # Flush last sprint
    if current_sprint_tasks:
        sprints.append(
            SprintPlan(
                sprint_number=sprint_number,
                tasks=current_sprint_tasks,
                total_hours=current_sprint_hours,
                capacity=capacity,
            )
        )

    total_hours = sum(t.estimated_hours for t in flat)

    return ScheduleResponse(
        sprints=sprints,
        total_hours=total_hours,
        total_sprints=len(sprints),
        capacity_per_sprint=capacity,
    )
