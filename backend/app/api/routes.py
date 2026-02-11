from fastapi import APIRouter, HTTPException

from app.models.task import (
    DecomposeRequest,
    DecomposeResponse,
    ExpandTaskRequest,
    ScheduleResponse,
    TaskNode,
)
from app.services.ai_decomposer import decompose_tasks, expand_task
from app.services.graph_validator import (
    compute_total_hours,
    detect_circular_dependencies,
    validate_dependencies,
)
from app.services.scheduler import compute_schedule

router = APIRouter()


@router.post("/decompose", response_model=DecomposeResponse)
async def decompose(req: DecomposeRequest):
    """Decompose a feature request into a structured task tree using AI."""
    try:
        tasks = await decompose_tasks(req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}") from e

    # Validate
    dep_errors = validate_dependencies(tasks)
    if dep_errors:
        raise HTTPException(status_code=422, detail={"dependency_errors": dep_errors})

    cycle_errors = detect_circular_dependencies(tasks)
    if cycle_errors:
        raise HTTPException(status_code=422, detail={"circular_dependency_errors": cycle_errors})

    total_hours = compute_total_hours(tasks)

    # Capacity
    team_size = len(req.team_members) if req.team_members else 1
    total_member_hours = (
        sum(m.hours_per_week for m in req.team_members)
        if req.team_members
        else req.hours_per_week_default
    )
    hours_per_sprint = total_member_hours * (req.sprint_days / 5.0)
    capacity = hours_per_sprint * (1 - req.buffer_percent)
    sprints_needed = max(1, -(-int(total_hours) // int(capacity))) if capacity > 0 else 1

    return DecomposeResponse(
        tasks=tasks,
        total_estimated_hours=total_hours,
        sprint_capacity=capacity,
        sprints_needed=sprints_needed,
    )


@router.post("/schedule", response_model=ScheduleResponse)
async def schedule(req: DecomposeRequest):
    """Decompose and schedule tasks into sprints."""
    try:
        tasks = await decompose_tasks(req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}") from e

    cycle_errors = detect_circular_dependencies(tasks)
    if cycle_errors:
        raise HTTPException(status_code=422, detail={"circular_dependency_errors": cycle_errors})

    return compute_schedule(tasks, req)


@router.post("/schedule-from-tasks", response_model=ScheduleResponse)
async def schedule_from_tasks(
    tasks: list[TaskNode],
    sprint_days: int = 10,
    buffer_percent: float = 0.2,
    hours_per_week: float = 40,
):
    """Schedule pre-existing tasks into sprints (no AI call)."""
    cycle_errors = detect_circular_dependencies(tasks)
    if cycle_errors:
        raise HTTPException(status_code=422, detail={"circular_dependency_errors": cycle_errors})

    req = DecomposeRequest(
        prompt="(manual)",
        sprint_days=sprint_days,
        buffer_percent=buffer_percent,
        hours_per_week_default=hours_per_week,
    )
    return compute_schedule(tasks, req)


@router.post("/validate")
async def validate(tasks: list[TaskNode]):
    """Validate a task tree for dependency errors and circular references."""
    dep_errors = validate_dependencies(tasks)
    cycle_errors = detect_circular_dependencies(tasks)
    total_hours = compute_total_hours(tasks)
    return {
        "valid": len(dep_errors) == 0 and len(cycle_errors) == 0,
        "dependency_errors": dep_errors,
        "circular_dependency_errors": cycle_errors,
        "total_estimated_hours": total_hours,
    }


@router.post("/expand-task")
async def expand_task_endpoint(req: ExpandTaskRequest):
    """Use AI to break a single task into smaller subtasks."""
    try:
        subtasks = await expand_task(req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}") from e

    return {"parent_id": req.task.id, "subtasks": subtasks}
