from __future__ import annotations

from app.models.task import TaskNode


def _collect_all_ids(tasks: list[TaskNode]) -> set[str]:
    ids: set[str] = set()
    for task in tasks:
        ids.add(task.id)
        if task.children:
            ids.update(_collect_all_ids(task.children))
    return ids


def _flatten(tasks: list[TaskNode]) -> list[TaskNode]:
    flat: list[TaskNode] = []
    for t in tasks:
        flat.append(t)
        if t.children:
            flat.extend(_flatten(t.children))
    return flat


def detect_circular_dependencies(tasks: list[TaskNode]) -> list[str]:
    """Return list of error messages for any circular dependencies found."""
    flat = _flatten(tasks)
    task_map = {t.id: t for t in flat}
    valid_ids = set(task_map.keys())
    errors: list[str] = []
    visited: set[str] = set()
    rec_stack: set[str] = set()

    def dfs(task_id: str, path: list[str]) -> None:
        if task_id in rec_stack:
            cycle_start = path.index(task_id)
            cycle = " -> ".join(path[cycle_start:] + [task_id])
            errors.append(f"Circular dependency: {cycle}")
            return
        if task_id in visited:
            return
        visited.add(task_id)
        rec_stack.add(task_id)
        path.append(task_id)
        task = task_map.get(task_id)
        if task:
            for dep in task.dependencies:
                if dep in valid_ids:
                    dfs(dep, path[:])
        rec_stack.discard(task_id)

    for task_id in task_map:
        if task_id not in visited:
            dfs(task_id, [])

    return errors


def validate_dependencies(tasks: list[TaskNode]) -> list[str]:
    """Validate that all dependency references point to existing task IDs."""
    all_ids = _collect_all_ids(tasks)
    flat = _flatten(tasks)
    errors: list[str] = []
    for task in flat:
        for dep in task.dependencies:
            if dep not in all_ids:
                errors.append(
                    f"Task '{task.id}' depends on unknown task '{dep}'"
                )
    return errors


def compute_total_hours(tasks: list[TaskNode]) -> float:
    """Sum estimated_hours across all tasks (including children)."""
    total = 0.0
    for task in tasks:
        total += task.estimated_hours
        if task.children:
            total += compute_total_hours(task.children)
    return total
