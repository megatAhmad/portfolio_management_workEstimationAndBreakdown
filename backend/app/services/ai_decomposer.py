import json
import re

from app.core.config import settings
from app.models.task import DecomposeRequest, ExpandTaskRequest, TaskNode


_JSON_SCHEMA = """\
Output JSON schema per node:
{
  "id": "string",
  "title": "string",
  "description": "string",
  "estimated_hours": number,
  "dependencies": ["string"],
  "priority": "low|medium|high|critical",
  "children": [<nested TaskNode objects>]
}
"""

_COMMON_RULES = """\
Rules:
- Each task must have: id, title, description, estimated_hours, dependencies (list of ids), priority (low/medium/high/critical).
- Use hierarchical IDs like "1", "1.1", "1.2", "2", "2.1" etc.
- Dependencies reference other task IDs. A subtask implicitly depends on its parent.
- Priority should reflect business value and technical risk.
- Tasks can have children (subtasks) forming a tree structure.
- Return ONLY valid JSON — an array of top-level TaskNode objects.
"""

SYSTEM_PROMPT_FULL_PROJECT = f"""\
You are an expert project manager and software architect. Given a feature request, \
break it down into a complete end-to-end digital project task tree.

Include ALL phases of a production project:
- Requirements & design
- Backend / API development
- Frontend / UI development
- Database schema & data layer
- Authentication & authorization
- Third-party integrations
- Testing (unit, integration, e2e)
- DevOps, CI/CD, deployment
- Documentation

Estimate hours realistically for a mid-level developer.

{_COMMON_RULES}
{_JSON_SCHEMA}
"""

SYSTEM_PROMPT_AI_DS = f"""\
You are an expert data scientist and ML engineer. Given a research or modelling request, \
break it down into a focused AI/Data Science proof-of-concept task tree.

Focus ONLY on the experimental / modelling workflow:
- Problem definition & success metrics
- Data acquisition & sourcing
- Exploratory data analysis (EDA)
- Data cleaning & preprocessing
- Feature engineering
- Model selection & baseline
- Model training & experimentation
- Hyperparameter tuning
- Evaluation & error analysis
- Results documentation & notebook write-up

Do NOT include tasks for:
- User authentication / login systems
- Production deployment / CI/CD
- Frontend UI development
- Database integration / ORM layers
- Infrastructure / DevOps

Estimate hours realistically for a mid-level data scientist.

{_COMMON_RULES}
{_JSON_SCHEMA}
"""

EXPAND_SYSTEM_PROMPT = f"""\
You are an expert project planner. You will be given a single task and must break it \
down into smaller, more granular subtasks.

Rules:
- Return a JSON array of subtask objects that will become children of the given task.
- Use hierarchical IDs based on the parent task ID (e.g. if parent is "2", children are "2.1", "2.2", etc.).
- Each subtask follows the same schema.
- Estimate hours realistically — the sum of subtask hours should approximate the parent's estimated hours.
- Preserve the parent's priority unless a subtask clearly warrants a different one.
- Return ONLY valid JSON — an array of TaskNode objects.

{_JSON_SCHEMA}
"""


def _get_system_prompt(mode: str) -> str:
    if mode == "ai_ds_experiment":
        return SYSTEM_PROMPT_AI_DS
    return SYSTEM_PROMPT_FULL_PROJECT


def _build_user_prompt(req: DecomposeRequest) -> str:
    parts = [f"Feature Request:\n{req.prompt}"]
    if req.repo_context:
        parts.append(f"\nRepository/Branch Context:\n{req.repo_context}")
    if req.team_members:
        members = ", ".join(
            f"{m.name} ({m.hours_per_week}h/week)" for m in req.team_members
        )
        parts.append(f"\nTeam: {members}")
    parts.append(
        f"\nSprint length: {req.sprint_days} working days, "
        f"Buffer: {int(req.buffer_percent * 100)}%"
    )
    return "\n".join(parts)


def _build_expand_prompt(req: ExpandTaskRequest) -> str:
    parts = [
        f"Task to expand:\n- ID: {req.task.id}\n- Title: {req.task.title}"
        f"\n- Description: {req.task.description}"
        f"\n- Estimated Hours: {req.task.estimated_hours}\n- Priority: {req.task.priority}"
    ]
    if req.user_context:
        parts.append(f"\nUser guidance:\n{req.user_context}")
    return "\n".join(parts)


def _extract_json(text: str) -> list[dict]:
    """Extract JSON array from LLM response, handling markdown fences."""
    fence_match = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text)
    if fence_match:
        return json.loads(fence_match.group(1))
    bracket_match = re.search(r"\[[\s\S]*\]", text)
    if bracket_match:
        return json.loads(bracket_match.group(0))
    raise ValueError("No JSON array found in AI response")


async def _call_anthropic(system: str, user_msg: str) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )
    return response.content[0].text


async def _call_openai(system: str, user_msg: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o",
        max_tokens=4096,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
    )
    return response.choices[0].message.content or ""


async def _call_llm(system: str, user_msg: str) -> str:
    if settings.AI_PROVIDER == "openai":
        return await _call_openai(system, user_msg)
    return await _call_anthropic(system, user_msg)


async def decompose_tasks(req: DecomposeRequest) -> list[TaskNode]:
    system = _get_system_prompt(req.mode)
    raw = await _call_llm(system, _build_user_prompt(req))
    tasks_data = _extract_json(raw)
    return [TaskNode.model_validate(t) for t in tasks_data]


async def expand_task(req: ExpandTaskRequest) -> list[TaskNode]:
    """Break a single task into smaller subtasks using AI."""
    raw = await _call_llm(EXPAND_SYSTEM_PROMPT, _build_expand_prompt(req))
    tasks_data = _extract_json(raw)
    return [TaskNode.model_validate(t) for t in tasks_data]
