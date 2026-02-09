from __future__ import annotations

from pydantic import BaseModel, Field


class TaskNode(BaseModel):
    id: str
    title: str
    description: str
    estimated_hours: float = Field(ge=0)
    dependencies: list[str] = Field(default_factory=list)
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    children: list[TaskNode] = Field(default_factory=list)


class TeamMember(BaseModel):
    name: str
    hours_per_week: float = Field(gt=0)


class DecomposeRequest(BaseModel):
    prompt: str = Field(min_length=1, description="Natural language feature request")
    repo_context: str | None = Field(
        default=None,
        description="GitHub/GitLab branch URL or directory file listing",
    )
    team_members: list[TeamMember] = Field(default_factory=list)
    hours_per_week_default: float = Field(
        default=40, gt=0, description="Default hours per week per member"
    )
    sprint_days: int = Field(default=10, gt=0, description="Number of days per sprint")
    buffer_percent: float = Field(
        default=0.2, ge=0, le=1, description="Safety buffer percentage"
    )


class DecomposeResponse(BaseModel):
    tasks: list[TaskNode]
    total_estimated_hours: float
    sprint_capacity: float
    sprints_needed: int


class ScheduledTask(BaseModel):
    id: str
    title: str
    description: str
    estimated_hours: float
    dependencies: list[str]
    priority: str
    start_day: int
    end_day: int
    sprint: int


class SprintPlan(BaseModel):
    sprint_number: int
    tasks: list[ScheduledTask]
    total_hours: float
    capacity: float


class ScheduleResponse(BaseModel):
    sprints: list[SprintPlan]
    total_hours: float
    total_sprints: int
    capacity_per_sprint: float
