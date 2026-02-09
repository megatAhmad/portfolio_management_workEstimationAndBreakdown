import json
import re

from app.core.config import settings
from app.models.task import DecomposeRequest, TaskNode


SYSTEM_PROMPT = """\
You are an expert project manager and software architect. Given a feature request, \
break it down into a structured task tree.

Rules:
- Each task must have: id, title, description, estimated_hours, dependencies (list of ids), priority (low/medium/high/critical).
- Use hierarchical IDs like "1", "1.1", "1.2", "2", "2.1" etc.
- Dependencies reference other task IDs. A subtask implicitly depends on its parent.
- Estimate hours realistically for a mid-level developer.
- Priority should reflect business value and technical risk.
- Tasks can have children (subtasks) forming a tree structure.
- Return ONLY valid JSON — an array of top-level TaskNode objects.

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


def _extract_json(text: str) -> list[dict]:
    """Extract JSON array from LLM response, handling markdown fences."""
    # Try to find JSON inside code fences
    fence_match = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text)
    if fence_match:
        return json.loads(fence_match.group(1))
    # Try raw JSON
    bracket_match = re.search(r"\[[\s\S]*\]", text)
    if bracket_match:
        return json.loads(bracket_match.group(0))
    raise ValueError("No JSON array found in AI response")


async def decompose_with_anthropic(req: DecomposeRequest) -> list[TaskNode]:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _build_user_prompt(req)}],
    )
    raw = response.content[0].text
    tasks_data = _extract_json(raw)
    return [TaskNode.model_validate(t) for t in tasks_data]


async def decompose_with_openai(req: DecomposeRequest) -> list[TaskNode]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o",
        max_tokens=4096,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(req)},
        ],
    )
    raw = response.choices[0].message.content or ""
    tasks_data = _extract_json(raw)
    return [TaskNode.model_validate(t) for t in tasks_data]


async def decompose_tasks(req: DecomposeRequest) -> list[TaskNode]:
    if settings.AI_PROVIDER == "openai":
        return await decompose_with_openai(req)
    return await decompose_with_anthropic(req)
