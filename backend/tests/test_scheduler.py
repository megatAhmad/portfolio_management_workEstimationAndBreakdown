import pytest

from app.models.task import DecomposeRequest, TaskNode, TeamMember
from app.services.graph_validator import (
    compute_total_hours,
    detect_circular_dependencies,
    validate_dependencies,
)
from app.services.scheduler import compute_schedule


def _make_tasks() -> list[TaskNode]:
    return [
        TaskNode(
            id="1",
            title="Setup",
            description="Project setup",
            estimated_hours=8,
            dependencies=[],
            priority="high",
        ),
        TaskNode(
            id="2",
            title="Backend",
            description="Backend dev",
            estimated_hours=24,
            dependencies=["1"],
            priority="high",
        ),
        TaskNode(
            id="3",
            title="Frontend",
            description="Frontend dev",
            estimated_hours=20,
            dependencies=["1"],
            priority="medium",
        ),
        TaskNode(
            id="4",
            title="Integration",
            description="Integrate",
            estimated_hours=12,
            dependencies=["2", "3"],
            priority="high",
        ),
    ]


def _make_request(**kwargs) -> DecomposeRequest:
    defaults = {
        "prompt": "test",
        "sprint_days": 10,
        "buffer_percent": 0.2,
        "hours_per_week_default": 40,
    }
    defaults.update(kwargs)
    return DecomposeRequest(**defaults)


class TestGraphValidator:
    def test_no_circular_deps(self):
        tasks = _make_tasks()
        errors = detect_circular_dependencies(tasks)
        assert errors == []

    def test_circular_deps_detected(self):
        tasks = [
            TaskNode(id="a", title="A", description="", estimated_hours=4, dependencies=["b"]),
            TaskNode(id="b", title="B", description="", estimated_hours=4, dependencies=["a"]),
        ]
        errors = detect_circular_dependencies(tasks)
        assert len(errors) > 0
        assert "Circular dependency" in errors[0]

    def test_validate_dependencies_ok(self):
        tasks = _make_tasks()
        errors = validate_dependencies(tasks)
        assert errors == []

    def test_validate_dependencies_missing(self):
        tasks = [
            TaskNode(id="1", title="A", description="", estimated_hours=4, dependencies=["99"]),
        ]
        errors = validate_dependencies(tasks)
        assert len(errors) == 1
        assert "unknown task '99'" in errors[0]

    def test_total_hours(self):
        tasks = _make_tasks()
        assert compute_total_hours(tasks) == 64

    def test_total_hours_with_children(self):
        tasks = [
            TaskNode(
                id="1",
                title="Parent",
                description="",
                estimated_hours=4,
                children=[
                    TaskNode(id="1.1", title="Child", description="", estimated_hours=8),
                ],
            ),
        ]
        assert compute_total_hours(tasks) == 12


class TestScheduler:
    def test_basic_schedule(self):
        tasks = _make_tasks()
        req = _make_request()
        result = compute_schedule(tasks, req)
        assert result.total_hours == 64
        assert result.total_sprints >= 1
        assert result.capacity_per_sprint > 0

    def test_dependencies_respected(self):
        tasks = _make_tasks()
        req = _make_request()
        result = compute_schedule(tasks, req)

        # Flatten all scheduled tasks
        all_scheduled = []
        for sprint in result.sprints:
            all_scheduled.extend(sprint.tasks)

        task_map = {t.id: t for t in all_scheduled}

        # Task 4 depends on 2 and 3, should come after both
        if "4" in task_map and "2" in task_map and "3" in task_map:
            assert task_map["4"].sprint >= task_map["2"].sprint
            assert task_map["4"].sprint >= task_map["3"].sprint

    def test_capacity_overflow(self):
        """Tasks exceeding sprint capacity should overflow to next sprint."""
        tasks = [
            TaskNode(id="1", title="Big", description="", estimated_hours=100, priority="high"),
            TaskNode(id="2", title="Also big", description="", estimated_hours=100, dependencies=[], priority="medium"),
        ]
        req = _make_request(hours_per_week_default=40, sprint_days=5, buffer_percent=0.2)
        # Capacity = 40 * (5/5) * 0.8 = 32 hours
        result = compute_schedule(tasks, req)
        assert result.total_sprints >= 2

    def test_team_members_capacity(self):
        tasks = _make_tasks()
        req = _make_request(
            team_members=[
                TeamMember(name="Alice", hours_per_week=40),
                TeamMember(name="Bob", hours_per_week=30),
            ]
        )
        result = compute_schedule(tasks, req)
        # Capacity should use team member hours: (40+30) * (10/5) * 0.8 = 112
        assert result.capacity_per_sprint == 112
